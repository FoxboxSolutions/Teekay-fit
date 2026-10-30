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
 * Registre des clés éditoriales de messages/fr.json. L'application se base sur
 * le marqueur [À FOURNIR] dans les messages ; ce registre documente le statut
 * et le propriétaire de chaque champ et alimente la liste des contenus à fournir.
 */
export const contentRegistry = {
  // Approuvés (fournis).
  "brand.name": { status: "approved" },
  "brand.accent": { status: "approved" },
  "home.title": { status: "approved" },
  "home.tagline": { status: "approved" },
  "home.hero.baseline": { status: "approved" },

  // Accueil — à fournir (owner = propriétaire du business).
  "home.hero.heading": { status: "placeholder", owner: "owner", note: "proposition de valeur" },
  "home.hero.mediaAlt": { status: "placeholder", owner: "owner", note: "visuel/vidéo hero" },
  "home.coach.body": { status: "placeholder", owner: "coach", note: "présentation courte" },
  "home.disciplinesSection.intro": { status: "placeholder", owner: "coach", note: "formulation disciplines" },
  "home.method.body": { status: "placeholder", owner: "owner", note: "étapes du parcours" },
  "home.faqTeaser.i1": { status: "placeholder", owner: "owner" },
  "home.faqTeaser.a1": { status: "placeholder", owner: "owner" },
  "home.faqTeaser.i2": { status: "placeholder", owner: "owner" },
  "home.faqTeaser.a2": { status: "placeholder", owner: "owner" },
  "home.faqTeaser.i3": { status: "placeholder", owner: "owner" },
  "home.faqTeaser.a3": { status: "placeholder", owner: "owner" },
  "home.finalCta.heading": { status: "placeholder", owner: "owner", note: "appel à l'action final" },

  // À propos — à fournir (coach).
  "about.name": { status: "placeholder", owner: "coach", note: "nom public" },
  "about.bioShort": { status: "placeholder", owner: "coach", note: "biographie courte" },
  "about.bioLong": { status: "placeholder", owner: "coach", note: "biographie longue" },
  "about.qualifications": { status: "placeholder", owner: "coach", note: "qualifications vérifiées" },
  "about.experience": { status: "placeholder", owner: "coach", note: "expérience réelle" },
  "about.photoAlt": { status: "placeholder", owner: "coach", note: "photo du coach" },
  "about.socials": { status: "placeholder", owner: "coach", note: "liens réseaux" },

  // FAQ — à fournir (owner).
  "faq.i1": { status: "placeholder", owner: "owner" },
  "faq.a1": { status: "placeholder", owner: "owner" },
  "faq.i2": { status: "placeholder", owner: "owner" },
  "faq.a2": { status: "placeholder", owner: "owner" },
  "faq.i3": { status: "placeholder", owner: "owner" },
  "faq.a3": { status: "placeholder", owner: "owner" },
  "faq.i4": { status: "placeholder", owner: "owner" },
  "faq.a4": { status: "placeholder", owner: "owner" },

  // Questionnaire — décharge (juriste).
  "questionnaire.waiverLabel": {
    status: "placeholder",
    owner: "jurist",
    note: "texte de la décharge",
  },

  // Disciplines — formulation (coach).
  "disciplines.intro": { status: "placeholder", owner: "coach", note: "présentation par discipline" },

  // Pages légales — texte juridique (juriste).
  "legal.privacy.body": { status: "placeholder", owner: "jurist" },
  "legal.terms.body": { status: "placeholder", owner: "jurist" },
  "legal.refunds.body": { status: "placeholder", owner: "jurist" },
} as const satisfies Record<string, ContentEntry>;

export type ContentKey = keyof typeof contentRegistry;

export function contentStatus(key: ContentKey): ContentStatus {
  return contentRegistry[key].status;
}
