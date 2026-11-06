import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { linkCustomersAfterVerify, normalizeEmail } from "@/lib/auth/customer-access";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";

/**
 * M8 (bloc 0a) — Consommation du lien de connexion (POST UNIQUEMENT).
 *
 * Le GET de la page /auth/confirm affiche un bouton « Se connecter » ; ce
 * POST consomme le token_hash (vérification GoTrue, jeton à USAGE UNIQUE).
 * Le passage par un POST protège des scanners de liens des messageries
 * (préchargement) qui déclencheraient sinon la consommation du jeton.
 *
 * La liaison customers.profile_id n'a lieu qu'ici, APRÈS la vérification
 * réussie du lien (e-mail vérifié), avec l'e-mail normalisé — idempotente,
 * jamais une ligne déjà liée à un autre utilisateur (SQL dédié).
 *
 * `next` : chemin RELATIF d'une liste blanche uniquement — tout autre
 * (//, https://, \\, inconnu) retombe sur /fr/account (pas de redirection
 * ouverte).
 *
 * Réponses : redirections 303 — succès vers `next`, échec (jeton inconnu,
 * expiré ou déjà consommé) vers la même page en erreur NEUTRE (aucune
 * distinction : pas d'énumération de jetons).
 */

const NEXT_FALLBACK = "/fr/account";
const NEXT_ALLOWLIST = [NEXT_FALLBACK, "/fr"];

function safeNext(raw: string | null): string {
  if (!raw) return NEXT_FALLBACK;
  // Chemin relatif interne UNIQUEMENT : tout ce qui commence par autre
  // chose qu'un seul « / » (//evil.tld, https://, \\host, /a/../b hors
  // liste) est rejeté au profit du défaut.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("\\")) {
    return NEXT_FALLBACK;
  }
  return NEXT_ALLOWLIST.includes(raw) ? raw : NEXT_FALLBACK;
}

export async function POST(request: Request) {
  // Anti-abus : la consommation est un acte sensible (usage unique).
  const limited = await checkRateLimit(ipRateLimitKey(request.headers, "auth_confirm_ip"), 20, 900);
  if (!limited) {
    return NextResponse.redirect(
      new URL(`/fr/auth/confirm?error=1`, request.url),
      303,
    );
  }

  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get("token_hash");
  const type = form?.get("type");
  const next = safeNext(
    typeof form?.get("next") === "string" ? (form.get("next") as string) : null,
  );

  if (typeof tokenHash !== "string" || tokenHash.length < 16 || tokenHash.length > 512 || type !== "magiclink") {
    return NextResponse.redirect(
      new URL(`/fr/auth/confirm?error=1`, request.url),
      303,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });

  if (error || !data?.user?.email) {
    // Jeton inconnu, expiré ou DÉJÀ CONSOMMÉ : même page neutre.
    return NextResponse.redirect(
      new URL(`/fr/auth/confirm?error=1`, request.url),
      303,
    );
  }

  // E-mail vérifié par le lien : liaison des lignes customers (idempotente,
  // jamais une ligne liée à un autre utilisateur). Jamais fatal : une
  // erreur de liaison n'empêche pas la session (réparable par re-demande
  // de lien ; le compte ne disparaît pas).
  try {
    await linkCustomersAfterVerify({
      email: normalizeEmail(data.user.email),
      userId: data.user.id,
    });
  } catch (linkError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "customer_link_failed",
        detail: linkError instanceof Error ? linkError.message : String(linkError),
      }),
    );
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
