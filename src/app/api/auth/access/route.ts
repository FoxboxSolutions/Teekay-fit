import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isValidOrderStatusTokenFormat,
  lookupOrderStatus,
} from "@/lib/orders/status";
import {
  ensureCustomerAccount,
  createLoginLink,
} from "@/lib/auth/customer-access";
import { getMailer } from "@/lib/mailer/provider";

const accessSchema = z.object({
  statusToken: z.string().min(16).max(128),
});

/**
 * M8 (bloc 3b) — « Accéder à mon espace » depuis la page de suivi.
 *
 * Le client clique sur le bouton : SI le paiement est confirmé, un e-mail
 * de connexion (lien magique unique, notre Mailer) part vers l'adresse de
 * la commande. Le lien envoyé ne contient AUCUN fichier ni URL de
 * téléchargement — seulement la connexion vers /fr/account ; le droit reste
 * vérifié côté serveur à chaque téléchargement.
 *
 * SÉCURITÉ / NEUTRALITÉ : la réponse est TOUJOURS `{ ok: true }` (même
 * corps, même statut 200) — jeton inconnu, commande non payée, e-mail
 * absent, erreur d'envoi : aucune différence observable (pas d'énumération
 * de commandes, pas d'oracle de paiement). Les erreurs sont journalisées
 * jamais fatales. Pas d'outbox : c'est une relance utilisateur (le flux
 * initial couvre déjà email_outbox idempotent).
 */
export async function POST(request: Request) {
  const allowed = await checkRateLimit(
    ipRateLimitKey(request.headers, "auth_access_ip"),
    30,
    600,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = accessSchema.safeParse(body);
  if (!parsed.success || !isValidOrderStatusTokenFormat(parsed.data.statusToken)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  try {
    const lookup = await lookupOrderStatus(parsed.data.statusToken);
    // Jeton inconnu ou expiré : même réponse que tout le reste.
    if (lookup.status !== "found" || lookup.order.order_status !== "paid") {
      return NextResponse.json({ ok: true });
    }

    // Paiement confirmé : e-mail de la commande (client lié à la commande).
    const admin = createSupabaseAdminClient();
    const { data: rows } = await admin
      .from("orders")
      .select("id, customers(email)")
      .eq("reference", lookup.order.reference)
      .eq("status", "paid")
      .limit(1);
    const row = (rows ?? [])[0] as
      | { customers: { email: string | null } | null }
      | undefined;
    const email = row?.customers?.email;
    if (!email) return NextResponse.json({ ok: true });

    // Compte (idempotent) + lien de connexion unique → NOTRE Mailer.
    await ensureCustomerAccount({ email });
    const link = await createLoginLink({ email, next: "/fr/account" });

    await getMailer().send({
      to: email.trim().toLowerCase(),
      subjectKey: "account.accessEmail",
      params: {},
      subject: "Teekay Fit — accéder à votre espace et vos PDF",
      text: [
        "Bonjour,",
        "",
        "Vous avez demandé l'accès à votre espace client.",
        "",
        `Connexion (lien unique, valable une fois) : ${link.url}`,
        "",
        "Ce lien ne contient aucun fichier : la connexion est requise, et le",
        "téléchargement reste vérifié côté serveur.",
        "",
        "L'équipe Teekay Fit.",
      ].join("\n"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Never-fatal : la réponse reste identique, l'erreur est journalisée
    // sans aucune donnée personnelle.
    console.error(
      JSON.stringify({
        level: "error",
        event: "auth_access_failed",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ ok: true });
  }
}
