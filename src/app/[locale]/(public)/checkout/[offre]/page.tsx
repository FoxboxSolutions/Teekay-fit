import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { OFFER_SLUGS, type OfferSlug } from "@/lib/site/nav-data";

export const revalidate = 60;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    OFFER_SLUGS.map((offre) => ({ locale, offre })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "offer" });
  return { title: t("checkoutSoonTitle") };
}

export default async function CheckoutSoonPage({
  params,
}: {
  params: Promise<{ locale: string; offre: string }>;
}) {
  const { locale, offre } = await params;
  if (!OFFER_SLUGS.includes(offre as OfferSlug)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("offer");
  const slug = offre as OfferSlug;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-start justify-center px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("checkoutSoonTitle")}</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-muted">{t("checkoutSoonBody")}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <WhatsAppButton offerSlug={slug} />
        <Link
          href={`/coaching/${slug}`}
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-input px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
        >
          {t("backToCoaching")}
        </Link>
      </div>
    </main>
  );
}
