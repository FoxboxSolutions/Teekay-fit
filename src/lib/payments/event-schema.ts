import { z } from "zod";

/**
 * Schéma du webhook (amont commun) — validé APRÈS la vérification
 * d'authenticité, sur le CORPS BRUT fourni par la route.
 * Aucun champ de santé/PII ne transite ici : seuls identifiants et montants.
 */
export const webhookEventSchema = z.object({
  /** Identifiant d'événement CÔTÉ FOURNISSEUR (clé d'idempotence). */
  id: z.string().min(1).max(200),
  type: z.enum(["payment.confirmed", "payment.failed"]),
  /** Référence de paiement fournie à la création (payments.provider_reference). */
  payment_ref: z.string().min(1).max(200),
  /** Montant annoncé (re-vérifié contre payments.amount_da par la route). */
  amount_da: z.number().int().nonnegative(),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;
