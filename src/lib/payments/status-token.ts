import { randomBytes, createHash } from "node:crypto";

/**
 * Jeton de statut de commande (M6, décision amendement 3) :
 *  - contenu aléatoire ≥128 bits (ici 256 bits) ;
 *  - SEUL le hash SHA-256 est stocké (orders.status_token_hash) ;
 *  - expiration 14 jours par défaut, renouvelable à la connexion ;
 *  - jeton inconnu ou expiré ⇒ page neutre identique.
 *
 * Le jeton brut n'apparaît qu'une fois, dans la réponse de création
 * (et éventuellement dans l'e-mail de confirmation à venir) — jamais en base.
 */
export function createStatusToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url"); // 256 bits
  return { token, hash: hashStatusToken(token), expiresAt: defaultStatusTokenExpiry() };
}

export const STATUS_TOKEN_TTL_DAYS = 14;

export function defaultStatusTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + STATUS_TOKEN_TTL_DAYS * 86_400_000);
}

/** Hash identique à l'algorithme stocké en base (SHA-256 hexadécimal). */
export function hashStatusToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
