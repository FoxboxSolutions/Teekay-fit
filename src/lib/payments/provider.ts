import type { z } from "zod";

/**
 * Couche fournisseur indépendante (M6) : la route ne connaît QUE cette
 * interface. Les fournisseurs réels (SlickPay, Chargily — M7) et le BaridiMob
 * manuel (M7) implémentent la même interface, jamais de logique provider
 * inline dans les routes.
 *
 * Aucun secret n'est exposé par l'interface ; chaque implémentation lit ses
 * propres variables d'environnement (jamais NEXT_PUBLIC_*).
 */

/** Types d'événements du domaine (amont commun). */
export const PAYMENT_EVENT_TYPES = ["payment.confirmed", "payment.failed"] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

/** Résultat de la création d'un paiement chez le fournisseur. */
export interface PaymentInit {
  /** Référence côté fournisseur (stockée dans payments.provider_reference). */
  providerReference: string | null;
  /** URL de redirection ou null (paiement manuel : instructions affichées M7). */
  redirectUrl: string | null;
}

/** Événement authentifié par la vérification du webhook. */
export type WebhookPayload = import("./event-schema").WebhookEvent;

export interface WebhookHeaders {
  /** Signature brute (ex. en-tête X-Fake-Signature) — jamais journalisée. */
  signature: string | null;
  /** Horodatage UUID de la requête (unix seconds, tolérance vérifiée). */
  timestamp: string | null;
}

export class WebhookVerificationError extends Error {}

/**
 * Contrat unique : chaque fournisseur sait créer un paiement et vérifier
 * (signature + tolérance horodatage) les notifications entrantes, à partir
 * du CORPS BRUT (exigence webhook : jamais un JSON re-formatté avant la
 * vérification HMAC).
 */
export interface PaymentProvider {
  readonly name: string;
  /** Crée le paiement chez le fournisseur (peut-être local pour « fake »). */
  createPayment(input: {
    orderId: string;
    paymentId: string;
    amountDa: number;
    reference: string;
  }): Promise<PaymentInit>;
  /**
   * Vérifie le webhook : corps brut + en-têtes de vérification.
   * Lève WebhookVerificationError (signature, horloge, format) — aucun
   * secret ni corps complet ne doit apparaître dans le message d'erreur.
   */
  verifyWebhook(headers: WebhookHeaders, rawBody: string): Promise<WebhookPayload>;
}
