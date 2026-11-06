import "server-only";

/**
 * M8 — observabilité des services dégradés (mémoire du processus) :
 *  - échec d'envoi e-mail (mailer) ;
 *  - échec de génération de PDF (source corrompée/chiffrée/trop lourde,
 *    délai dépassé).
 *
 * Chaque échec est JOURNALISÉ sans PII (code de cause stable, jamais de
 * message brut pouvant contenir une adresse ou un nom) et remonte dans
 * /api/health (`services`) pour pilotage — la liste des envois en échec
 * avec bouton « renvoyer » reste en M9 (point ouvert milestone.md).
 */

export type DegradedService = "mailer" | "pdf_generation";

export type DegradedEntry = {
  service: DegradedService;
  /** Code de cause stable (aucune donnée personnelle). */
  reason: string;
  count: number;
  /** Horodatage ISO de la dernière occurrence. */
  lastAt: string;
};

const entries = new Map<string, DegradedEntry>();

/** Enregistre un échec de service (journal sans PII + compteur santé). */
export function recordDegraded(service: DegradedService, reason: string): void {
  // Garde-fou : la raison ne doit JAMAIS porter de donnée personnelle —
  // seuls les codes stables passent (l'appelant fournit un code).
  const key = `${service}:${reason}`;
  const existing = entries.get(key);
  if (existing) {
    existing.count += 1;
    existing.lastAt = new Date().toISOString();
  } else {
    entries.set(key, { service, reason, count: 1, lastAt: new Date().toISOString() });
  }
  console.error(
    JSON.stringify({
      level: "error",
      event: "service_degraded",
      service,
      reason,
    }),
  );
}

/** État dégradé courant (vide = tout va bien) — lu par /api/health. */
export function getDegraded(): DegradedEntry[] {
  return Array.from(entries.values()).map((e) => ({ ...e }));
}

/** Test uniquement : remise à zéro des compteurs. */
export function resetDegraded(): void {
  entries.clear();
}
