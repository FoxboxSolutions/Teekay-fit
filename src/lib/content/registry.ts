/**
 * Registre du contenu éditorial du site public (M4).
 *
 * Chaque clé de contenu est déclarée avec un statut :
 *  - "approved"    : contenu fourni et approuvé, affichable en production.
 *  - "placeholder" : contenu à fournir — le texte contient le marqueur
 *                    [À FOURNIR …] et le build de production (build:prod)
 *                    échoue tant qu'il reste un placeholder.
 *
 * L'app affiche les placeholders avec un cadre distinct en dev/préprod
 * (NEXT_PUBLIC_PLACEHOLDER_FRAMES ou NODE_ENV !== "production").
 */

export type ContentStatus = "approved" | "placeholder";

/** Marqueur littéral présent dans tout texte à fournir. */
export const PLACEHOLDER_MARKER = "[À FOURNIR";

/** Propriétaire du contenu à fournir (pour la liste finale). */
export type ContentOwner = "coach" | "jurist" | "owner";

export interface ContentEntry {
  status: ContentStatus;
  /** Qui doit fournir le contenu (utile pour « placeholder »). */
  owner?: ContentOwner;
  /** Précision sur ce qui doit être fourni. */
  note?: string;
}

/** Détecte un placeholder à partir du texte affiché. */
export function isPlaceholderText(text: string): boolean {
  return text.includes(PLACEHOLDER_MARKER);
}

/**
 * Registre des clés éditoriales. Les blocs M4 suivants ajoutent leurs clés ici.
 * Le script de contrôle (check-placeholders.mjs) se base sur le marqueur dans
 * messages/*.json ; ce registre sert de source typée pour l'app et les tests.
 */
export const contentRegistry = {
  "home.title": { status: "approved" },
  "home.tagline": { status: "approved" },
} as const satisfies Record<string, ContentEntry>;

export type ContentKey = keyof typeof contentRegistry;

export function contentStatus(key: ContentKey): ContentStatus {
  return contentRegistry[key].status;
}
