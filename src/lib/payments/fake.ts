import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  WebhookVerificationError,
  type PaymentInit,
  type PaymentProvider,
  type WebhookHeaders,
  type WebhookPayload,
} from "./provider";
import { webhookEventSchema } from "./event-schema";

/**
 * Fournisseur FICTIF « fake » (M6, dev/preview UNIQUEMENT — la garde
 * applicative assertPaymentProviderConfig interdit tout autre environnement,
 * et le processus refuse de démarrer en production avec ce fournisseur).
 *
 * Aucun réseau : createPayment génère une référence locale et renvoie le
 * lien du simulateur (/fr/payment/simulate/[id], page 404 hors dev/preview).
 * Le webhook est signé HMAC-SHA256(secret, "<timestamp>.<corps>") avec
 * tolérance d'horodatage — le test E2E et le simulateur le reproduisent
 * exactement comme SlickPay/Chargily le feront (M7).
 */

const DEFAULT_TOLERANCE_SECONDS = 300;

function webhookSecret(): string {
  // Secret serveur uniquement (jamais NEXT_PUBLIC_*) ; défaut réservé au
  // fournisseur fictif et à l'usage local/test.
  return process.env.PAYMENT_WEBHOOK_SECRET ?? "fake-only-local-secret";
}

export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake" as const;

  /** tolérance injectable pour les tests (timestamp vieil / futur). */
  constructor(private readonly toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS) {}

  async createPayment(input: {
    orderId: string;
    paymentId: string;
    amountDa: number;
    reference: string;
  }): Promise<PaymentInit> {
    const providerReference = `fake-${randomUUID()}`;
    return {
      providerReference,
      // Lien vers le simulateur dev-only fonctionnellement équivalent à
      // la future page de caisse fournisseur (M7) : même forme d'URL.
      redirectUrl: `/fr/payment/simulate/${input.reference}`,
    };
  }

  async verifyWebhook(headers: WebhookHeaders, rawBody: string): Promise<WebhookPayload> {
    if (!headers.signature || !headers.timestamp) {
      throw new WebhookVerificationError("signature_manquante");
    }
    const ts = Number(headers.timestamp);
    if (!Number.isFinite(ts)) {
      throw new WebhookVerificationError("horodatage_invalide");
    }
    const age = Math.abs(Date.now() / 1000 - ts);
    if (age > this.toleranceSeconds) {
      // Tolérance stricte : rejeu hors fenêtre ⇒ rejet (jamais de précision
      // sur l'écart exact — pas d'oracle).
      throw new WebhookVerificationError("horodatage_hors_tolerance");
    }

    const expected = createHmac("sha256", webhookSecret())
      .update(`${headers.timestamp}.${rawBody}`)
      .digest("hex");
    if (!signatureMatches(expected, headers.signature)) {
      throw new WebhookVerificationError("signature_invalide");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new WebhookVerificationError("corps_invalide");
    }
    const event = webhookEventSchema.safeParse(parsed);
    if (!event.success) {
      // Aucun détail de la payload dans l'erreur (pas de journal de contenu).
      throw new WebhookVerificationError("evenement_invalide");
    }
    return event.data;
  }
}

/** Comparaison en temps constant (jamais de fuite via la durée). */
function signatureMatches(expectedHex: string, provided: string): boolean {
  const providedHex = provided.toLowerCase().trim();
  if (providedHex.length !== expectedHex.length) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "utf8"), Buffer.from(providedHex, "utf8"));
}

/** Fabrique une signature valide (usage : simulateur, tests E2E). */
export function fakeWebhookSignature(timestamp: string, rawBody: string): string {
  return createHmac("sha256", webhookSecret()).update(`${timestamp}.${rawBody}`).digest("hex");
}
