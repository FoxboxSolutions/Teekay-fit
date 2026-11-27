import { NextResponse } from "next/server";
import { z } from "zod";
import { createLoginLink } from "@/lib/auth/customer-access";
import { safeNextPath } from "@/lib/auth/redirect-paths";
import { getMailer } from "@/lib/mailer/provider";
import { checkRateLimit, emailRateLimitKey, ipRateLimitKey } from "@/lib/security/rate-limit";

const requestSchema = z.object({
  email: z.email().max(254),
  /** Destination validée par liste blanche stricte (`safeNextPath`). */
  next: z.string().max(64).optional(),
});

/**
 * Plancher de temps de réponse sur le chemin neutre (200 {ok:true}) :
 * compte connu (génération + envoi) et compte inconnu (échec GoTrue) ne
 * doivent pas être distinguables par leur latence. Le plancher ne
 * s'applique qu'à la réponse neutre — 400/429 restent immédiats.
 */
const MIN_NEUTRAL_RESPONSE_MS = 150;

async function waitForNeutralFloor(startedAt: number): Promise<void> {
  const remaining = MIN_NEUTRAL_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/**
 * Lien magique par e-mail — mode d'authentification principal (PRD §15).
 * Connexion seule : les inscriptions publiques sont désactivées (config
 * Supabase, décision M6) — un e-mail inconnu est traité exactement comme
 * un e-mail connu (réponse identique et latence comparable, pas
 * d'énumération de comptes, AUCUNE création de compte).
 *
 * Le lien est généré par `admin.generateLink` (service-role, aucun e-mail
 * GoTrue) puis envoyé par NOTRE Mailer : il porte un `token_hash` consommé
 * en POST par /auth/confirm. Limitation de débit PAR IP ET PAR E-MAIL
 * (e-mail haché avec sel HMAC, jamais en clair dans les compteurs).
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const { email } = parsed.data;
  const next = safeNextPath(parsed.data.next);

  const [byIp, byEmail] = await Promise.all([
    // IP élargie 30/900 (correction avant M9 : NAT/bureau) — exactement
    // DEUX buckets ici (pin de test) ; le e-mail reste le seuil fin 5/900.
    checkRateLimit(ipRateLimitKey(request.headers, "auth_magic_ip"), 30, 900),
    checkRateLimit(emailRateLimitKey(email, "auth_magic_email"), 5, 900),
  ]);
  if (!byIp || !byEmail) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  try {
    const link = await createLoginLink({ email, next });
    await getMailer().send({
      to: email.trim().toLowerCase(),
      subjectKey: "auth.loginEmail",
      params: {},
      subject: "Teekay Fit — votre lien de connexion",
      text: [
        "Bonjour,",
        "",
        "Voici votre lien de connexion à Teekay Fit (lien unique, valable une fois) :",
        "",
        link.url,
        "",
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
        "",
        "L'équipe Teekay Fit.",
      ].join("\n"),
    });
  } catch {
    // Compte inconnu, erreur GoTrue ou Mailer : la réponse reste
    // STRICTEMENT identique. Aucun détail, aucune adresse en journal.
    console.error(JSON.stringify({ level: "error", event: "magic_link_error" }));
  }

  await waitForNeutralFloor(startedAt);
  return NextResponse.json({ ok: true });
}
