import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Versions des textes de consentement (PRD §16).
 *
 * POINT OUVERT M5 : textes à valider par le juriste. Toute modification d'un
 * texte impose d'incrémenter la version correspondante (preuve de la version
 * acceptée dans `consents.version`).
 */
export const CONSENT_VERSIONS = {
  recontact: "2026-10-31",
  marketing: "2026-10-31",
  age18: "2026-10-31",
} as const;

/** Durée de vie du jeton de résultat du quiz : 72 heures. */
export const RESULT_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

export interface ResultToken {
  /** Jeton opaque renvoyé au navigateur (URL /results — aucune donnée personnelle). */
  token: string;
  /** SHA-256 hex — seule forme stockée en base (`quiz_submissions.result_token_hash`). */
  hash: string;
  expiresAt: Date;
}

/** Jeton aléatoire 256 bits (exigence ≥ 128 bits) + hachage + expiration 72 h. */
export function newResultToken(): ResultToken {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashResultToken(token),
    expiresAt: new Date(Date.now() + RESULT_TOKEN_TTL_MS),
  };
}

/** Hachage stocké en base : le jeton en clair n'est jamais persisté. */
export function hashResultToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Jeton factice pour le honeypot : réponse de forme identique à un vrai
 * succès, sans aucune écriture en base (le /results affichera « expiré »).
 */
export function fakeResultToken(): string {
  return randomBytes(32).toString("base64url");
}
