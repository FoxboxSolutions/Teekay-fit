import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { leadFormGuard } from "@/lib/leads/guard";
import { checkRateLimit, emailRateLimitKey, ipRateLimitKey } from "@/lib/security/rate-limit";
import { fusedRateLimitKey } from "@/lib/security/rate-keys";
import { normalizePhoneE164 } from "@/lib/phone";
import { createStatusToken } from "@/lib/payments/status-token";
import { getPaymentProvider } from "@/lib/payments/loader";
import { CaptureMailer } from "@/lib/mailer/mailer";
import { logEvent } from "@/lib/observability/logger";

/**
 * Création de commande (M6). Toute la logique métier vit dans la RPC
 * `create_order` (idempotence, promo, places, PAR-Q) — la route ne fait :
 * la garde anti-abus (IP + Turnstile + honeypot) + rate limit PAR E-MAIL,
 * le zod, le hash du contenu canonique, la sélection du fournisseur via la
 * couche abstraite, l'attachement de la référence de paiement et la
 * réponse neutre.
 *
 * Idempotence : en-tête `Idempotency-Key` obligatoire (un retry réseau ne
 * crée jamais de doublon) + hash SHA-256 du contenu canonique stocké avec
 * la clé ; même clé + autre contenu ⇒ 409 (voir RPC).
 */

/**
 * Versions des consentements à la commande (PLACEHOLDERS JURISTE — point
 * ouvert M6 : à valider, puis incrémenter toute modification).
 */
export const ORDER_CONSENT_VERSIONS = {
  terms: "2026-11-03-placeholder-juriste",
  privacy: "2026-11-03-placeholder-juriste",
  refunds: "2026-11-03-placeholder-juriste",
  healthWaiver: "2026-11-03-placeholder-juriste",
} as const;

const aptitudeSchema = z.strictObject({
  q1: z.boolean(),
  q2: z.boolean(),
  q3: z.boolean(),
  q4: z.boolean(),
  q5: z.boolean(),
  q6: z.boolean(),
  q7: z.boolean(),
  objective: z.enum(["strength", "endurance", "weight_loss", "performance", "hybrid"]),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
});

const orderCreateSchema = z.strictObject({
  offerSlug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(80),
  /** E-mail OBLIGATOIRE (décision tranchée : compte client + reçu passent par lui). */
  email: z.email().max(254),
  phone: z.union([z.string().trim().min(6).max(20), z.literal("")]).optional(),
  /** 'online' par défaut ; 'manual' = BaridiMob (M7 : instructions). */
  paymentMethod: z.enum(["online", "manual"]).optional(),
  promoCode: z.string().trim().min(1).max(40).optional(),
  /** Présentiel : séance (YYYY-MM-DD). Ignoré pour les offres en ligne. */
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** PAR-Q structuré : 7 booléens, aucun texte libre (jamais de diagnostic). */
  aptitude: aptitudeSchema.optional(),
  waiver: z.literal(true).optional(),
  consentTerms: z.literal(true),
  consentPrivacy: z.literal(true),
  consentRefunds: z.literal(true),
  turnstileToken: z.string().min(1).max(2048).optional(),
  website: z.string().optional(), // honeypot — doit rester vide
});

/** Hash du contenu canonique : clés triées, jamais le corps brut. */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentHash(input: Record<string, unknown>): string {
  return createHash("sha256").update(`m6-order-v1\n${canonicalize(input)}`).digest("hex");
}

/** Statut HTTP par code PG de la RPC (codes neutres, sans détail). */
function httpStatusFor(code: string | undefined): number {
  if (code === "P4096") return 409; // idempotency_conflict
  return 400; // « complet », promo, PAR-Q… messages neutres
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  // Garde anti-abus commune (honeypot + rate limit IP + Turnstile).
  // IP 30/600 (correction avant M9 : élargie pour un utilisateur légitime
  // derrière une IP partagée — bureau/NAT) ; en complément, clé FUSÉE
  // IP+e-mail 5/600 stricte dès la garde : l'e-mail plausible du corps brut
  // (pré-zod) est haché — la même requête répétée depuis la même IP avec le
  // même e-mail est stoppée tôt. Aucun identifiant en clair dans les compteurs.
  const candidateEmail =
    typeof raw.email === "string"
      ? raw.email.trim().toLowerCase().slice(0, 254)
      : "";
  const emailPlausible = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(candidateEmail);
  const guard = await leadFormGuard(request, {
    bucketPrefix: "order_ip",
    limit: 30,
    windowSeconds: 600,
    honeypot: raw.website,
    turnstileToken: raw.turnstileToken,
    identities: emailPlausible
      ? [
          {
            key: fusedRateLimitKey(
              [
                ipRateLimitKey(request.headers, "order_ip"),
                emailRateLimitKey(candidateEmail, "order_email"),
              ],
              "order_ip_fused",
            ),
            limit: 5,
            windowSeconds: 600,
          },
        ]
      : [],
  });
  if (guard === "honeypot") {
    // Forme identique à un succès (aucune écriture) — indétectable.
    logEvent({ level: "info", event: "order_submit_honeypot" });
    return NextResponse.json({ ok: true, reference: "TKF-0000-FAKE" });
  }
  if (guard === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }
  if (guard === "captcha_failed") {
    return NextResponse.json({ error: "captcha_requis" }, { status: 403 });
  }

  // Clé d'idempotence : en-tête standard, jamais dans le corps (retry).
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json({ error: "idempotency_key_requise" }, { status: 400 });
  }

  const parsed = orderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const input = parsed.data;

  // Limitation de débit PAR E-MAIL (complément de l'IP) : seul un hash
  // salé du mail entre en base (jamais l'e-mail en clair dans les compteurs).
  const emailOk = await checkRateLimit(emailRateLimitKey(input.email, "order_email"), 5, 600);
  if (!emailOk) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  // Fournisseur via la couche abstraite (garde fake incluse) ; null ⇒ manuel.
  let providerName = "manual";
  let provider: ReturnType<typeof getPaymentProvider> = null;
  try {
    provider = getPaymentProvider();
    providerName = provider?.name ?? "manual";
  } catch (err) {
    logEvent({ level: "error", event: "order_provider_config", message: (err as Error).message });
    return NextResponse.json({ error: "fournisseur_indisponible" }, { status: 503 });
  }

  const statusToken = createStatusToken();
  const phoneNorm = input.phone ? normalizePhoneE164(input.phone) : null;
  if (input.phone && !phoneNorm) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const hash = contentHash({
    offerSlug: input.offerSlug,
    name: input.name,
    email: input.email.toLowerCase(),
    phoneNorm,
    promoCode: input.promoCode ?? null,
    slotDate: input.slotDate ?? null,
    aptitude: input.aptitude ?? null,
    paymentMethod: input.paymentMethod ?? "online",
  });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_order", {
    p_idempotency_key: idempotencyKey,
    p_request_hash: hash,
    p_status_token_hash: statusToken.hash,
    p_status_token_expires_at: statusToken.expiresAt.toISOString(),
    p_offer_slug: input.offerSlug,
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? null,
    p_phone_norm: phoneNorm,
    p_provider: providerName,
    p_payment_method: input.paymentMethod === "manual" ? "baridimob-manuel" : providerName,
    p_promo_code: input.promoCode ?? null,
    p_slot_date: input.slotDate ?? null,
    p_aptitude: input.aptitude ?? null,
    p_waiver_version: input.waiver ? ORDER_CONSENT_VERSIONS.healthWaiver : null,
    p_consent_terms_version: ORDER_CONSENT_VERSIONS.terms,
    p_consent_privacy_version: ORDER_CONSENT_VERSIONS.privacy,
    p_consent_refunds_version: ORDER_CONSENT_VERSIONS.refunds,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    logEvent({ level: "info", event: "order_create_refused", code: code ?? "unknown" });
    // Codes neutres uniquement : pas de détail SQL/captions vers le client.
    const neutral =
      code === "P4096"
        ? "idempotency_conflict"
        : code === "P4090"
          ? "complet"
          : "creation_refusee";
    return NextResponse.json(
      { error: neutral },
      { status: httpStatusFor(code) },
    );
  }
  const created = data as {
    order_id: string;
    reference: string;
    total_da: number;
    discount_da: number;
    duplicated: boolean;
  };

  // Paiement fournisseur (fake pour l'instant — le vrai arrive au M7) :
  // attache la référence du fournisseur au paiement « pending ».
  let paymentRedirectUrl: string | null = null;
  if (provider && !created.duplicated) {
    const { data: paymentRow } = await admin
      .from("payments")
      .select("id")
      .eq("order_id", created.order_id)
      .single();
    if (paymentRow?.id) {
      const init = await provider.createPayment({
        orderId: created.order_id,
        paymentId: paymentRow.id,
        amountDa: created.total_da,
        reference: created.reference,
      });
      paymentRedirectUrl = init.redirectUrl;
      await admin
        .from("payments")
        .update({ provider_reference: init.providerReference })
        .eq("id", paymentRow.id);
    }
  }

  // Confirmation neutre (« commande acceptée ») : implémentation de TEST en
  // capture locale — le SMTP réel (Supabase) est un point ouvert M6/M7.
  const mailer = new CaptureMailer();
  await mailer.send({
    to: input.email,
    subjectKey: "order.confirmationEmail",
    params: { reference: created.reference, total: String(created.total_da) },
  });

  return NextResponse.json({
    ok: true,
    reference: created.reference,
    total_da: created.total_da,
    discount_da: created.discount_da,
    statusToken: created.duplicated ? undefined : statusToken.token,
    statusTokenExpiresAt: statusToken.expiresAt.toISOString(),
    paymentRedirectUrl,
    duplicated: created.duplicated,
  });
}
