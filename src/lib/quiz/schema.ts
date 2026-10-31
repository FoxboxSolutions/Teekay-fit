import { z } from "zod";

/**
 * Schéma des réponses du quiz « Trouve ton programme » (PRD §7).
 *
 * Les valeurs sont des CODES ; les libellés humains vivent dans next-intl
 * (`messages/fr.json`, namespace `quiz`). Aucune donnée de santé ici : le
 * PAR-Q reste dans le parcours de commande (M6). Un test (`quiz-recommend`)
 * échoue si un champ/valeur du schéma relève de la santé.
 */

export const OBJECTIFS = ["forme", "performance", "force", "endurance"] as const;
export const NIVEAUX = ["debutant", "intermediaire", "avance"] as const;
export const DISPOS = ["1_2", "3_4", "5_plus"] as const;
export const MATERIELS = ["salle", "domicile_avec", "domicile_sans"] as const;
export const PREFERENCES = ["en_ligne", "presentiel", "indifferent"] as const;
export const BUDGETS = [
  "moins_2000",
  "2000_5999",
  "6000_9999",
  "10000_plus",
  "discuter",
] as const;

/** Champs du quiz, dans l'ordre d'affichage (le budget est optionnel). */
export const QUIZ_FIELDS = [
  "objectif",
  "niveau",
  "dispo",
  "materiel",
  "preference",
  "budget",
] as const;

export type QuizField = (typeof QUIZ_FIELDS)[number];

export const quizAnswersSchema = z.object({
  objectif: z.enum(OBJECTIFS),
  niveau: z.enum(NIVEAUX),
  dispo: z.enum(DISPOS),
  materiel: z.enum(MATERIELS),
  preference: z.enum(PREFERENCES),
  // Budget indicatif — optionnel (« je préfère en discuter » ou non renseigné).
  budget: z.enum(BUDGETS).optional(),
});

export type QuizAnswers = z.infer<typeof quizAnswersSchema>;

/** Tous les jetons du schéma (clés + valeurs) pour le test « pas de santé ». */
export function quizSchemaTokens(): string[] {
  const keys = Object.keys(quizAnswersSchema.shape);
  const values = [
    ...OBJECTIFS,
    ...NIVEAUX,
    ...DISPOS,
    ...MATERIELS,
    ...PREFERENCES,
    ...BUDGETS,
  ];
  return [...keys, ...values];
}
