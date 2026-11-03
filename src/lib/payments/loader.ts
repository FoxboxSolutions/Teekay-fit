import { allowsFakePaymentProvider, appEnvStatus } from "@/lib/env";

/**
 * Présentation du fournisseur(s) de paiement. Les valeurs valides sont
 * fixées par la contrainte SQL `payments_provider_check` (migration
 * 20261102100000) : slickpay, chargily, manual, fake.
 */
export const PAYMENT_PROVIDERS = ["slickpay", "chargily", "manual", "fake"] as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

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
export class PaymentProviderConfigError extends Error {}

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
