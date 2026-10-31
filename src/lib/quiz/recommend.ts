import type { QuizAnswers } from "./schema";

/**
 * Règle de recommandation du quiz — FONCTION PURE, DÉTERMINISTE, SANS IA.
 *
 * On ne recommande QUE des offres actives lues en base (passées en entrée) ;
 * le prix envoyé par le navigateur n'est jamais pris en compte.
 *
 * Règles (détail dans le PRD §7 et le plan M5) :
 *  1. Seules les offres `is_active` sont candidates ; aucune → `null`
 *     (état vide honnête côté UI, jamais de fausse offre).
 *  2. Préférence de format : présentiel → `coaching_in_person`,
 *     en ligne → `coaching_online`, indifféré → l'objectif départage
 *     (« forme » → programme d'entrée `starter`, sinon `coaching_online`).
 *  3. Plafond de budget : « moins de 2 000 » → 1 999 ; « 2 000 à 5 999 » →
 *     5 999 ; « 6 000 à 9 999 » → 9 999 ; « 10 000 et plus »/« je préfère en
 *     discuter »/non renseigné → ∞ (aucune contrainte, recommandation fondée
 *     sur la préférence et l'objectif seulement).
 *  4. Si l'offre préférée tient dans le plafond → on la recommande telle quelle.
 *  5. Sinon → offre immédiatement inférieure qui tient encore dans le plafond.
 *  6. Si même la moins chère dépasse le plafond (budget < 2 000) → offre
 *     d'entrée (Starter) affichée avec SON prix, sans pression.
 */

export interface RecommendableOffer {
  slug: string;
  offer_type: string;
  price_da: number;
  is_active: boolean;
}

export type RecommendationReason =
  | "preference"
  | "budget_ceiling"
  | "budget_floor";

export interface Recommendation {
  slug: string;
  reason: RecommendationReason;
  /** true si le budget a forcé une offre moins chère que la préférée. */
  steppedDown: boolean;
}

const BUDGET_CEILINGS: Record<string, number> = {
  moins_2000: 1999,
  "2000_5999": 5999,
  "6000_9999": 9999,
  "10000_plus": Number.POSITIVE_INFINITY,
  discuter: Number.POSITIVE_INFINITY,
};

function ceilingOf(budget: string | undefined): number {
  if (!budget) return Number.POSITIVE_INFINITY;
  return BUDGET_CEILINGS[budget] ?? Number.POSITIVE_INFINITY;
}

const PREF_TO_TYPE: Record<string, string> = {
  presentiel: "coaching_in_person",
  en_ligne: "coaching_online",
};

function preferredOfferType(answers: QuizAnswers): string {
  const byPref = PREF_TO_TYPE[answers.preference];
  if (byPref) return byPref;
  // Préférence indifférente : l'objectif départage (« forme » → entrée).
  return answers.objectif === "forme" ? "starter" : "coaching_online";
}

/**
 * Recommande une offre active pour un jeu de réponses.
 * @returns la recommandation, ou `null` si aucune offre active.
 */
export function recommendOffer(
  offers: RecommendableOffer[],
  answers: QuizAnswers,
): Recommendation | null {
  const active = offers.filter((o) => o.is_active);
  if (active.length === 0) return null;

  const asc = [...active].sort((a, b) => a.price_da - b.price_da);
  const ceiling = ceilingOf(answers.budget);
  const target = preferredOfferType(answers);

  // Type préféré → sinon coaching en ligne → sinon 1re offre abordable →
  // sinon la moins chère. (?? écourte dès qu'une offre est trouvée.)
  const preferred =
    active.find((o) => o.offer_type === target) ??
    active.find((o) => o.offer_type === "coaching_online") ??
    asc.find((o) => o.price_da <= ceiling) ??
    asc[0];
  if (!preferred) return null; // défense : active non vide ⇒ au moins une offre

  if (preferred.price_da <= ceiling) {
    return { slug: preferred.slug, reason: "preference", steppedDown: false };
  }

  // Plafond dépassé : offre immédiatement inférieure qui tient dans le budget.
  const lower = asc.filter(
    (o) => o.price_da < preferred.price_da && o.price_da <= ceiling,
  );
  const pick = lower[lower.length - 1]; // le plus élevé encore abordable
  if (pick) {
    return { slug: pick.slug, reason: "budget_ceiling", steppedDown: true };
  }

  // Même la moins chère dépasse le plafond → offre d'entrée, prix affiché.
  const cheapest = asc[0];
  if (!cheapest) return null; // défense : active non vide ⇒ asc non vide
  return { slug: cheapest.slug, reason: "budget_floor", steppedDown: true };
}
