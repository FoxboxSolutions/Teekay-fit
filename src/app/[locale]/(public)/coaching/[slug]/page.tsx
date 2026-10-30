import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { AptitudeForm } from "@/components/site/aptitude-form";
import { OFFER_SLUGS, type OfferSlug } from "@/lib/site/nav-data";
import { getOfferBySlug, getOfferRemainingSlots } from "@/lib/offers/queries";

export const revalidate = 60;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    OFFER_SLUGS.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) return {};
  return { title: offer.name, description: offer.description ?? undefined };
}

const nf = new Intl.NumberFormat("fr-FR");

export default async function OfferPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!OFFER_SLUGS.includes(slug as OfferSlug)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("offer");
  const tq = await getTranslations("questionnaire");
  const offer = await getOfferBySlug(slug);
  if (!offer) notFound();

  const remaining = await getOfferRemainingSlots(offer.id);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <Link
        href="/coaching"
        className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
      >
        {t("backToCoaching")}
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{offer.name}</h1>
          <p className="mt-2 text-lg text-ink-muted">{offer.description}</p>

          <p className="mt-6 font-display text-5xl font-bold text-ink">
            {nf.format(offer.price_da)}{" "}
            <span className="text-2xl text-ink-muted">{t("currency")}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {offer.duration && (
              <span className="text-sm text-ink-muted">
                {t("durationLine", { duration: offer.duration })}
              </span>
            )}
            {remaining !== null && (
              <Badge variant={remaining > 0 ? "red" : "neutral"}>
                {remaining} {t("remaining")}
              </Badge>
            )}
          </div>

          {offer.inclusions && offer.inclusions.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-bold uppercase">{t("inclusionsTitle")}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {offer.inclusions.map((inc) => (
                  <li key={inc} className="text-ink-muted">
                    {inc}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {offer.exclusions && offer.exclusions.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-bold uppercase">{t("exclusionsTitle")}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {offer.exclusions.map((exc) => (
                  <li key={exc} className="text-ink-muted">
                    {exc}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {offer.conditions && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-bold uppercase">{t("conditionsTitle")}</h2>
              <p className="mt-3 text-ink-muted">{offer.conditions}</p>
            </section>
          )}

          <p className="mt-6 text-sm text-ink-muted">{t("noResultPromise")}</p>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-surface p-6">
            <div className="flex flex-col gap-3">
              <Link
                href={`/checkout/${offer.slug}`}
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-red-lux px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {t("cta")}
              </Link>
              <WhatsAppButton offerSlug={offer.slug as OfferSlug} />
            </div>
            <p className="mt-4 text-xs text-ink-muted">{t("noAutoRenew")}</p>
          </div>
        </aside>
      </div>

      <section className="mt-16 border-t border-line pt-12">
        <h2 className="font-display text-3xl font-bold uppercase">{tq("heading")}</h2>
        <p className="mt-3 max-w-2xl text-ink-muted">{tq("intro")}</p>
        <div className="mt-6 max-w-3xl">
          <AptitudeForm />
        </div>
      </section>
    </main>
  );
}
