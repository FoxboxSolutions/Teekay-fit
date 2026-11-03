import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { paymentSimulateAllowed } from "@/lib/env";

/**
 * Simulateur de paiement du fournisseur fictif « fake » (étape 1 / M6).
 * Exigence : 404 sauf development ou preview explicites avec
 * PAYMENT_PROVIDER=fake. Le gate s'exécute AVANT l'i18n et les params,
 * pour que la page n'expose rien (aucune traduction chargée, aucun
 * traitement de l'id) dans tout état où elle est interdite.
 *
 * Défaut sûr : APP_ENV absente/invalide ⇒ 404 (comportement production).
 * La page porte `noindex` quoi qu'il arrive et n'est jamais pré-rendue :
 * la décision dépend de l'environnement au moment de la requête.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("payment.simulate");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function PaymentSimulatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  if (!paymentSimulateAllowed()) notFound();

  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("payment.simulate");

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-start justify-center px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("title")}</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-muted">{t("intro")}</p>
      <dl className="mt-8 w-full rounded-control border border-line-input bg-surface p-4">
        <dt className="text-sm font-semibold uppercase text-ink-muted">{t("reference")}</dt>
        <dd className="font-display text-2xl font-bold">{id}</dd>
      </dl>
      <p className="mt-6 text-sm text-ink-muted">{t("notice")}</p>
    </main>
  );
}
