import { describe, it, expect } from "vitest";
import { recommendOffer, type RecommendableOffer } from "@/lib/quiz/recommend";
import { quizAnswersSchema, quizSchemaTokens } from "@/lib/quiz/schema";
import type { QuizAnswers } from "@/lib/quiz/schema";

const OFFERS: RecommendableOffer[] = [
  { slug: "starter", offer_type: "starter", price_da: 2000, is_active: true },
  { slug: "online", offer_type: "coaching_online", price_da: 6000, is_active: true },
  { slug: "in-person", offer_type: "coaching_in_person", price_da: 10000, is_active: true },
];

function answers(overrides: Partial<QuizAnswers>): QuizAnswers {
  return quizAnswersSchema.parse({
    objectif: "performance",
    niveau: "intermediaire",
    dispo: "3_4",
    materiel: "salle",
    preference: "en_ligne",
    ...overrides,
  });
}

describe("recommendOffer — table de cas (déterministe, sans IA)", () => {
  type Case = {
    label: string;
    a: Partial<QuizAnswers>;
    slug: string;
    reason: string;
    steppedDown: boolean;
  };

  const cases: Case[] = [
    // Préférence tenue quand elle tient dans le budget (jamais de survente).
    { label: "présentiel + 10 000+", a: { preference: "presentiel", budget: "10000_plus" }, slug: "in-person", reason: "preference", steppedDown: false },
    { label: "en ligne + 6 000–9 999", a: { preference: "en_ligne", budget: "6000_9999" }, slug: "online", reason: "preference", steppedDown: false },
    { label: "en ligne + 10 000+ (pas de survente in-person)", a: { preference: "en_ligne", budget: "10000_plus" }, slug: "online", reason: "preference", steppedDown: false },

    // Budget inférieur à l'offre préférée → offre immédiatement inférieure.
    { label: "présentiel + 6 000–9 999 → online", a: { preference: "presentiel", budget: "6000_9999" }, slug: "online", reason: "budget_ceiling", steppedDown: true },
    { label: "présentiel + 2 000–5 999 → starter", a: { preference: "presentiel", budget: "2000_5999" }, slug: "starter", reason: "budget_ceiling", steppedDown: true },
    { label: "en ligne + 2 000–5 999 → starter", a: { preference: "en_ligne", budget: "2000_5999" }, slug: "starter", reason: "budget_ceiling", steppedDown: true },

    // Budget < 2 000 → Starter affiché avec son prix (même s'il dépasse).
    { label: "présentiel + moins de 2 000 → Starter (floor)", a: { preference: "presentiel", budget: "moins_2000" }, slug: "starter", reason: "budget_floor", steppedDown: true },
    { label: "en ligne + moins de 2 000 → Starter (floor)", a: { preference: "en_ligne", budget: "moins_2000" }, slug: "starter", reason: "budget_floor", steppedDown: true },

    // « je préfère en discuter » (ou non renseigné) → préférence + objectif seulement.
    { label: "discuter + présentiel → in-person", a: { preference: "presentiel", budget: "discuter" }, slug: "in-person", reason: "preference", steppedDown: false },
    { label: "discuter + en ligne → online", a: { preference: "en_ligne", budget: "discuter" }, slug: "online", reason: "preference", steppedDown: false },
    { label: "budget absent + présentiel → in-person", a: { preference: "presentiel" }, slug: "in-person", reason: "preference", steppedDown: false },

    // Préférence indifférente → l'objectif départage.
    { label: "indifféré + forme → Starter", a: { preference: "indifferent", objectif: "forme", budget: "10000_plus" }, slug: "starter", reason: "preference", steppedDown: false },
    { label: "indifféré + performance → online", a: { preference: "indifferent", objectif: "performance", budget: "10000_plus" }, slug: "online", reason: "preference", steppedDown: false },
    { label: "indifféré + performance + moins de 2 000 → Starter", a: { preference: "indifferent", objectif: "performance", budget: "moins_2000" }, slug: "starter", reason: "budget_floor", steppedDown: true },
    { label: "indifféré + performance + discuter → online", a: { preference: "indifferent", objectif: "performance", budget: "discuter" }, slug: "online", reason: "preference", steppedDown: false },
  ];

  it.each(cases)("$label", ({ a, slug, reason, steppedDown }) => {
    const rec = recommendOffer(OFFERS, answers(a));
    expect(rec).not.toBeNull();
    expect(rec!.slug).toBe(slug);
    expect(rec!.reason).toBe(reason);
    expect(rec!.steppedDown).toBe(steppedDown);
  });

  it("ne recommande jamais une offre inactive", () => {
    const inactive = OFFERS.map((o) =>
      o.offer_type === "coaching_in_person" ? { ...o, is_active: false } : o,
    );
    const rec = recommendOffer(inactive, answers({ preference: "presentiel", budget: "10000_plus" }));
    expect(rec).not.toBeNull();
    expect(rec!.slug).not.toBe("in-person");
  });

  it("retourne null si aucune offre active", () => {
    const none = OFFERS.map((o) => ({ ...o, is_active: false }));
    expect(recommendOffer(none, answers({}))).toBeNull();
    expect(recommendOffer([], answers({}))).toBeNull();
  });

  it("est déterministe (même entrée → même sortie)", () => {
    const a = answers({ preference: "presentiel", budget: "6000_9999" });
    expect(recommendOffer(OFFERS, a)).toEqual(recommendOffer(OFFERS, a));
  });
});

describe("garde santé — aucun champ/valeur du quiz ne relève de la santé", () => {
  // Le PAR-Q (santé) reste dans le parcours de commande (M6), jamais dans le quiz.
  const HEALTH = [
    /sant[ée]/i, /maladie/i, /sympt[oô]me/i, /m[ée]dica/i, /douleur/i,
    /traitement/i, /diagnostic/i, /par-?q/i, /blessure/i, /allergie/i,
    /grossesse/i, /\bage\b/i, /\bpoids\b/i, /\bimc\b/i, /tension/i,
    /glyc[ée]mie/i, /cardiaque/i, /diab[èe]te/i,
  ];

  it("échoue si un jeton du schéma quiz contient un terme de santé", () => {
    const violations: string[] = [];
    for (const token of quizSchemaTokens()) {
      for (const re of HEALTH) {
        if (re.test(token)) {
          violations.push(`${token} (/${re.source}/)`);
          break;
        }
      }
    }
    expect(violations, "champ du schéma quiz relatif à la santé").toEqual([]);
  });
});
