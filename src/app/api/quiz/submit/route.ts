import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOffers } from "@/lib/offers/queries";
import { quizAnswersSchema } from "@/lib/quiz/schema";
import { recommendOffer } from "@/lib/quiz/recommend";
import { normalizePhoneE164 } from "@/lib/phone";
import { CONSENT_VERSIONS, fakeResultToken, newResultToken } from "@/lib/leads/capture";
import { leadFormGuard, leadIpBackstopLimit } from "@/lib/leads/guard";
import { ipRateLimitKey } from "@/lib/security/rate-limit";
import { fusedRateLimitKey, phoneRateLimitKey } from "@/lib/security/rate-keys";
import { logEvent } from "@/lib/observability/logger";

const quizSubmitSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  answers: quizAnswersSchema,
  consentRecontact: z.literal(true),
  consentMarketing: z.boolean().default(false),
  consentAge18: z.literal(true),
  turnstileToken: z.string().min(1).max(2048).optional(),
  website: z.string().optional(), // honeypot — doit rester vide
});

/**
 * Soumission du quiz « Trouve ton programme » (PRD §7/§11/§15).
 *
 * La recommandation est RECALCULÉE côté serveur (offres actives en base) :
 * le prix ou l'offre envoyés par le navigateur ne sont jamais crus.
 * Réponse identique que le numéro existe déjà ou non (anti-énumération).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  // Garde anti-abus : identités D'ABORD (téléphone normalisé haché 3/600,
  // fusée IP+téléphone 3/600 — protection principale), PUIS filet IP LARGE
  // configurable 30/600 (M9a — ajustement : un utilisateur légitime derrière
  // une IP partagée / NAT passe ; le spam même-IP MÊME-TÉLÉPHONE est bloqué
  // par le téléphone). Contact/compteurs : jamais le numéro ni l'IP en clair.
  const candidatePhone =
    typeof raw.phone === "string" ? normalizePhoneE164(raw.phone) : null;
  const identities = candidatePhone
    ? [
        {
          key: phoneRateLimitKey(candidatePhone, "lead_quiz_phone"),
          limit: 3,
          windowSeconds: 600,
        },
        {
          key: fusedRateLimitKey(
            [
              ipRateLimitKey(request.headers, "lead_quiz_ip"),
              phoneRateLimitKey(candidatePhone, "lead_quiz_phone"),
            ],
            "lead_quiz_ip_fused",
          ),
          limit: 3,
          windowSeconds: 600,
        },
      ]
    : undefined;

  const guard = await leadFormGuard(request, {
    bucketPrefix: "lead_quiz_ip",
    limit: leadIpBackstopLimit(),
    windowSeconds: 600,
    honeypot: raw.website,
    turnstileToken: raw.turnstileToken,
    identities,
  });
  if (guard === "honeypot") {
    logEvent({ level: "info", event: "quiz_submit_honeypot" });
    // Forme identique à un vrai succès : aucune écriture en base.
    return NextResponse.json({ ok: true, resultToken: fakeResultToken() });
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

  const parsed = quizSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { name, phone, email, answers, consentMarketing } = parsed.data;

  const phoneNorm = normalizePhoneE164(phone);
  if (!phoneNorm) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  // Recommandation serveur : seules les offres actives de la base comptent.
  const offers = await getOffers();
  const recommendation = recommendOffer(
    offers.map((offer) => ({ ...offer, is_active: true })),
    answers,
  );

  const { token, hash, expiresAt } = newResultToken();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("submit_lead", {
    p_name: name,
    p_phone: phone,
    p_phone_norm: phoneNorm,
    p_email: email && email !== "" ? email : null,
    p_goal: answers.objectif,
    p_offer_slug: recommendation?.slug ?? null,
    p_source: "quiz",
    p_answers: answers,
    p_recommended_slug: recommendation?.slug ?? null,
    p_result_token_hash: hash,
    p_result_token_expires_at: expiresAt.toISOString(),
    p_notes: null,
    p_consent_recontact_version: CONSENT_VERSIONS.recontact,
    p_consent_marketing_version: consentMarketing ? CONSENT_VERSIONS.marketing : null,
    p_consent_age18_version: CONSENT_VERSIONS.age18,
  });

  if (error) {
    logEvent({ level: "error", event: "quiz_submit_failed", message: error.message });
    return NextResponse.json({ error: "enregistrement_impossible" }, { status: 500 });
  }

  // Événement produit sans aucune donnée personnelle (PRD §14 — pas de santé,
  // pas de nom/téléphone dans les journaux).
  logEvent({
    level: "info",
    event: "submit_lead",
    source: "quiz",
    recommended: recommendation?.slug ?? null,
    reason: recommendation?.reason ?? null,
  });

  return NextResponse.json({ ok: true, resultToken: token });
}
