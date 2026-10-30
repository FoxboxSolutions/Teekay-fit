/** Slugs des pages par discipline (PRD §7) — alignés sur les routes. */
export const DISCIPLINES = [
  { slug: "hyrox", key: "hyrox" },
  { slug: "running", key: "running" },
  { slug: "trail", key: "trail" },
  { slug: "boxe", key: "boxe" },
  { slug: "musculation", key: "musculation" },
] as const;

export type DisciplineSlug = (typeof DISCIPLINES)[number]["slug"];

/** Slugs des offres — alignés sur la base (table offers) et les routes /coaching/*. */
export const OFFER_SLUGS = ["starter", "online", "in-person"] as const;
export type OfferSlug = (typeof OFFER_SLUGS)[number];
