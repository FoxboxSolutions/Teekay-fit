import { z } from "zod";

/**
 * Environnement d'exécution — module unique validé par zod, importé partout.
 *
 * APP_ENV : `development` | `preview` | `production`.
 *
 * Défaut sûr (oubli ou valeur invalide) :
 *  - argent / sécurité  → comportement PRODUCTION (provider fake refusé,
 *    simulateur de paiement 404) ;
 *  - indexation         → NON-production (noindex, robots.txt Disallow).
 *
 * Un oubli est visible via `/api/health` (`appEnv`) et sans danger.
 * Ne jamais utiliser NEXT_PUBLIC_PLACEHOLDER_FRAMES comme marqueur d'env.
 */

const appEnvSchema = z.enum(["development", "preview", "production"]);

export type AppEnv = z.infer<typeof appEnvSchema>;
export type AppEnvStatus = AppEnv | "absent" | "invalid";

/** Statut lisible (santé, journal) : valeur attendue, « absent » ou « invalid ». */
export function appEnvStatus(raw: string | undefined = process.env.APP_ENV): AppEnvStatus {
  if (raw === undefined || raw === "") return "absent";
  const parsed = appEnvSchema.safeParse(raw);
  return parsed.success ? parsed.data : "invalid";
}

/** Valeur exploitable ; null = absente ou invalide (appliquer les défauts sûrs). */
export function readAppEnv(raw?: string): AppEnv | null {
  const status = appEnvStatus(raw);
  return status === "absent" || status === "invalid" ? null : status;
}

/**
 * Argent / sécurité : vrai si le comportement doit être celui de la
 * production. Absente ou invalide ⇒ vrai (défaut sûr).
 */
export function isProductionLike(raw?: string): boolean {
  const env = readAppEnv(raw);
  return env === null || env === "production";
}

/** Indexation : seule une `production` explicite est indexable. */
export function isIndexable(raw?: string): boolean {
  return readAppEnv(raw) === "production";
}

/**
 * Provider de paiement fictif (tests/démo) : autorisé uniquement en
 * `development` ou `preview` explicites. Production, absente ou invalide ⇒
 * refusé — le démarrage avec PAYMENT_PROVIDER=fake doit échouer en prod.
 */
export function allowsFakePaymentProvider(raw?: string): boolean {
  const env = readAppEnv(raw);
  return env === "development" || env === "preview";
}

/**
 * Page /fr/payment/simulate/[id] : ouverte seulement si le provider fake est
 * autorisé ET configuré ; 404 partout ailleurs (toujours en production,
 * quelle que soit la config).
 */
export function paymentSimulateAllowed(
  raw?: string,
  provider: string | undefined = process.env.PAYMENT_PROVIDER,
): boolean {
  return allowsFakePaymentProvider(raw) && provider === "fake";
}

/** Valeur de l'en-tête X-Robots-Tag, ou null en production indexable. */
export function xRobotsTag(raw?: string): string | null {
  return isIndexable(raw) ? null : "noindex, nofollow";
}

/** Balise robots des métadonnées ; objet vide en production. */
export function nonIndexableMeta(
  raw?: string,
): { robots?: { index: false; follow: false } } {
  return isIndexable(raw) ? {} : { robots: { index: false, follow: false } };
}
