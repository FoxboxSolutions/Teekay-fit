import "server-only";

/**
 * Fuseau horaire de l'application (PRD / M9a) : Africa/Algiers, JAMAIS UTC.
 * L'Algérie n'observe pas l'heure d'été : le décalage est constant (+60 min),
 * mais il est calculé dynamiquement par Intl plutôt qu'en dur.
 */
export const ALGIERS_IANA = "Africa/Algiers";

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  timeZone: ALGIERS_IANA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

/** Composantes civiles (année/mois/jour) de l'instant à Alger. */
export function algiersComponents(instant: Date) {
  const parts = new Intl.DateTimeFormat("fr-FR", dateTimeOptions).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Décalage en minutes d'Alger par rapport à UTC à l'instant donné.
 * Construit l'heure civile lue à Alger, la relit comme un instant UTC,
 * puis compare : décalage = instant_utc - instant_local_comme_utc.
 */
export function algiersOffsetMinutes(instant: Date): number {
  const { year, month, day, hour, minute, second } = algiersComponents(instant);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // décalage = instant local lu comme UTC − instant UTC réel (+60 min à Alger)
  return Math.round((localAsUtc - instant.getTime()) / 60000);
}

/** Minuit heure d'Alger du jour contenant `instant` (instants UTC réels). */
export function startOfDayAlgiers(instant: Date): Date {
  const { year, month, day } = algiersComponents(instant);
  const midnightUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = algiersOffsetMinutes(new Date(midnightUtc));
  return new Date(midnightUtc - offset * 60000);
}

/** Dernière milliseconde du jour algérois contenant `instant`. */
export function endOfDayAlgiers(instant: Date): Date {
  return new Date(startOfDayAlgiers(instant).getTime() + 86_400_000 - 1);
}

/** Premier instant du mois algérois contenant `instant`. */
export function startOfMonthAlgiers(instant: Date): Date {
  const { year, month } = algiersComponents(instant);
  const midnightUtc = Date.UTC(year, month - 1, 1, 0, 0, 0);
  const offset = algiersOffsetMinutes(new Date(midnightUtc));
  return new Date(midnightUtc - offset * 60000);
}

/** Dernière milliseconde du mois algérois contenant `instant`. */
export function endOfMonthAlgiers(instant: Date): Date {
  const { year, month } = algiersComponents(instant);
  const next = month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const midnightUtc = Date.UTC(next.year, next.month - 1, 1, 0, 0, 0);
  const offset = algiersOffsetMinutes(new Date(midnightUtc));
  return new Date(midnightUtc - offset * 60000 - 1);
}

/** Plage demi-ouverte [start, end[ d'un jour algérois, au format ISO (DB-safe). */
export function dayRangeAlgiers(isoOrDate: string | Date): { start: string; end: string } {
  const instant = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const start = startOfDayAlgiers(instant);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Plage demi-ouverte [start, end[ d'un mois algérois, au format ISO (DB-safe). */
export function monthRangeAlgiers(
  isoOrDate: string | Date,
): { start: string; end: string } {
  const instant = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const start = startOfMonthAlgiers(instant);
  const end = endOfMonthAlgiers(instant);
  return { start: start.toISOString(), end: new Date(end.getTime() + 1).toISOString() };
}

/** Deux instants appartiennent-ils au même jour algérois ? */
export function isSameAlgiersDay(a: Date, b: Date): boolean {
  const s1 = startOfDayAlgiers(a).getTime();
  const s2 = startOfDayAlgiers(b).getTime();
  return s1 === s2;
}

/** Deux instants appartiennent-ils au même mois algérois ? */
export function isSameAlgiersMonth(a: Date, b: Date): boolean {
  const s1 = startOfMonthAlgiers(a).getTime();
  const s2 = startOfMonthAlgiers(b).getTime();
  return s1 === s2;
}
