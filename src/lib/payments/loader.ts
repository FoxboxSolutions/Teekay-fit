import { allowsFakePaymentProvider, appEnvStatus } from "@/lib/env";
import type { PaymentProvider } from "./provider";
import { FakePaymentProvider } from "./fake";

/**
 * Couche fournisseur (M6, décision amendement 5).
 *
 * Les valeurs valides sont fixées par la contrainte SQL
 * `payments_provider_check` (migration 20261102100000) :
 * slickpay, chargily, manual, fake.
 */
export const PAYMENT_PROVIDERS = ["slickpay", "chargily", "manual", "fake"] as const;

export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export class PaymentProviderConfigError extends Error {}

/**
 * Garde provider fictif « fake » (étape 1 / décision APP_ENV) :
 * `PAYMENT_PROVIDER=fake` est refusé si `APP_ENV` est `production`,
 * **absente ou invalide** ; il est autorisé uniquement en `development`
 * ou `preview` explicites. `assertPaymentProviderConfig` est appelé au
 * démarrage du processus via `src/instrumentation.ts` (`register`) :
 * une config interdite échoue — **le processus ne démarre pas**.
 *
 * Défaut sûr : un oubli d'APP_ENV désactive le simulateur (comportement
 * production) au lieu d'ouvrir un chemin de paiement fictif.
 *
 * Aucun secret ici — ce module ne lit que des flags de configuration.
 */
export function assertPaymentProviderConfig(
  provider: string | undefined = process.env.PAYMENT_PROVIDER,
  appEnv: string | undefined = process.env.APP_ENV,
): void {
  if ((provider ?? "").trim().toLowerCase() !== "fake") return;
  if (allowsFakePaymentProvider(appEnv)) return;

  throw new PaymentProviderConfigError(
    `PAYMENT_PROVIDER=fake refusé : APP_ENV=${appEnvStatus(appEnv)} ` +
      "(attendu : development ou preview explicite). " +
      "Le processus ne démarre pas en production.",
  );
}

/**
 * Fabrique du fournisseur courant (dépend uniquement de PAYMENT_PROVIDER) :
 *  - absent/vide ⇒ null : aucun paiement en ligne (la commande reste
 *    `pending_payment` sans paiement — l'admin/agenda gère le flux hors
 *    ligne, M7 pour le manuel BaridiMob) ;
 *  - fake ⇒ garde + implémentation fictive (dev/preview uniquement) ;
 *  - manual ⇒ null pour l'instant (création online à partir du M7) ;
 *  - slickpay/chargily ⇒ refus explicite : un fournisseur réel avec un
 *    code d'intégration incomplet doit se voir refuser le démarrage
 *    plutôt que de simuler un paiement.
 */
export function getPaymentProvider(
  provider: string | undefined = process.env.PAYMENT_PROVIDER,
): PaymentProvider | null {
  const name = (provider ?? "").trim().toLowerCase();
  if (name === "") return null;
  if (name === "fake") {
    assertPaymentProviderConfig(provider);
    return new FakePaymentProvider();
  }
  if (name === "manual") return null;
  if (name === "slickpay" || name === "chargily") {
    throw new PaymentProviderConfigError(
      `PAYMENT_PROVIDER=${name} non implémenté (prévu au M7) : aucun paiement ne doit être simulé.`,
    );
  }
  throw new PaymentProviderConfigError(`PAYMENT_PROVIDER=${name} inconnu.`);
}
