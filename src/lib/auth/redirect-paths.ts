/**
 * Destinations autorisées après une connexion par lien magique.
 *
 * Liste blanche STRICTE : comparaison exacte de la chaîne, aucune
 * normalisation. Tout le reste (URL absolue, `//host`, `\host`, chemin
 * inconnu, casse différente, espace, `..`, valeur encodée) retombe sur
 * `/fr/account`. Aucune redirection ouverte possible.
 *
 * `/fr/admin` est une destination de connexion : la garde admin
 * (`requireAdminAal2`) impose immédiatement le défi MFA (aal2) et redirige
 * vers `/{locale}/admin/mfa` tant que la session n'est pas vérifiée.
 */
export const ALLOWED_NEXT_PATHS = ["/fr/admin", "/fr/account"] as const;

export type AllowedNextPath = (typeof ALLOWED_NEXT_PATHS)[number];

export const DEFAULT_NEXT_PATH: AllowedNextPath = "/fr/account";

export function safeNextPath(raw: unknown): AllowedNextPath {
  if (typeof raw !== "string") return DEFAULT_NEXT_PATH;
  return (ALLOWED_NEXT_PATHS as readonly string[]).includes(raw)
    ? (raw as AllowedNextPath)
    : DEFAULT_NEXT_PATH;
}
