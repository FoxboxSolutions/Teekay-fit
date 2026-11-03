/**
 * Hook `register` de Next 16 — exécuté une fois au démarrage du serveur
 * (`next start`, `next dev` ; jamais pendant `next build`,
 * `NEXT_PHASE=phase-production-build` court-circuite le hook).
 *
 * Garde `PAYMENT_PROVIDER=fake` (étape 1) : en production — ou si `APP_ENV`
 * est absente/invalide — la config fictive lève et **le processus ne
 * démarre pas**. Rien à faire en edge runtime (pas de secrets de paiement).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertPaymentProviderConfig } = await import("@/lib/payments/loader");
  assertPaymentProviderConfig();
}
