import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashResultToken } from "@/lib/leads/capture";
import { getOfferBySlug, type Offer } from "@/lib/offers/queries";

/**
 * Lecture d'un résultat de quiz par jeton opaque (PRD §7/§15).
 *
 * Le jeton en clair n'est JAMAIS stocké : la base ne contient que son
 * SHA-256. Jeton inconnu, expiré (72 h) ou offre disparue → même réponse
 * « missing » (aucune fuite d'information sur l'existence du lead).
 */

/** Jeton base64url issu de randomBytes(32) : 43 caractères. Forme vérifiée avant tout accès base. */
export function isValidResultTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export type ResultLookup =
  | { status: "found"; offer: Offer | null }
  | { status: "missing" };

/**
 * Résultat associé à un jeton, ou `missing` (inconnu OU expiré — jamais
 * distinguable). `offer: null` = recommandation honnête « aucune offre ».
 */
export async function lookupResult(token: string): Promise<ResultLookup> {
  const hash = hashResultToken(token);
  const admin = createSupabaseAdminClient();

  // L'expiration est appliquée EN REQUÊTE : un jeton expiré disparaît
  // complètement du résultat (identique à un jeton inconnu).
  const { data, error } = await admin
    .from("quiz_submissions")
    .select("recommended_offer_slug")
    .eq("result_token_hash", hash)
    .gt("result_token_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({ level: "error", event: "quiz_result_fetch_failed", message: error.message }),
    );
    return { status: "missing" };
  }
  if (!data) return { status: "missing" };

  const slug = data.recommended_offer_slug;
  const offer = slug ? await getOfferBySlug(slug) : null;
  return { status: "found", offer };
}
