import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Clés de limitation de débit — module AUTO-CONTENU (correction avant M9)
 *
 * Rôle : fournir les clés « téléphone haché » et « fusée (IP + identité) »
 * sans toucher à `@/lib/security/rate-limit` — ce module-là est substitué
 * par des mocks PARTIELS dans plusieurs tests unitaires : toute nouvelle
 * exportation consommée par une route y serait `undefined` (crash). Les
 * fonctions ici ne servent qu'aux routes ; les tests qui les visent sont
 * ceux avec rate limit RÉEL (m5-routes, rate-limit-nat).
 *
 * Hygiène identique à rate-limit.ts : jamais d'identifiant en clair dans
 * la table `rate_limit_counters` — HMAC-SHA256 avec sel d'env
 * (`RATE_LIMIT_SALT`, sinon sel aléatoire local + erreur loguée).
 */

let processLocalSalt: string | null = null;

function rateLimitSalt(): string {
  const fromEnv = process.env.RATE_LIMIT_SALT;
  if (fromEnv) return fromEnv;
  if (!processLocalSalt) {
    processLocalSalt = randomBytes(32).toString("hex");
    console.error(
      JSON.stringify({
        level: "error",
        event: "rate_limit_salt_missing",
        detail: "RATE_LIMIT_SALT absent : sel local aléatoire, limites valables par instance",
      }),
    );
  }
  return processLocalSalt;
}

function hmacDigest(value: string): string {
  return createHmac("sha256", rateLimitSalt()).update(value).digest("hex");
}

/**
 * Clé de rate limit par TÉLÉPHONE : HMAC-SHA256 (sel d'env) — le numéro en
 * clair n'atteint jamais les compteurs (donnée personnelle, même règle que
 * l'IP et l'e-mail). Mieux vaut passer le numéro NORMALISÉ (E.164) : deux
 * écritures du même numéro partagent alors le même compteur.
 */
export function phoneRateLimitKey(phone: string, prefix: string): string {
  return `${prefix}:${hmacDigest(phone.trim().toLowerCase())}`;
}

/**
 * Clé FUSÉE : combine des composants DÉJÀ hachés (clé IP hachée + clé
 * identité hachée) en un seul compteur par paire — ex. `order_ip_fused`
 * (IP + e-mail) : strict là où la limite IP seule doit rester souple (NAT).
 * Aucune donnée personnelle n'entre ici en clair.
 */
export function fusedRateLimitKey(
  components: readonly string[],
  prefix: string,
): string {
  return `${prefix}:${hmacDigest(components.join("\u0001"))}`;
}
