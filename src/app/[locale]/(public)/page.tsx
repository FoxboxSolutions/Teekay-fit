import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ContentText } from "@/components/site/content-text";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion } from "@/components/ui/accordion";
import { DISCIPLINES, OFFER_ROUTES, OFFER_SLUGS } from "@/lib/site/nav-data";
import { getOffers, getOfferRemainingSlots } from "@/lib/offers/queries";

export const revalidate = 60;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: t("title"), description: t("metaDescription") };
}

const nf = new Intl.NumberFormat("fr-FR");

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tn = await getTranslations("nav");

  const offers = await getOffers();
  const withCapacity = await Promise.all(
    offers.map(async (offer) => ({
      offer,
      remaining: await getOfferRemainingSlots(offer.id),
    })),
  );

  return (
    <main>
      {/* 1. Hero */}
      <section className="border-b border-line bg-canvas">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-sm uppercase tracking-widest text-red-bright">{t("hero.baseline")}</p>
            <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-tight sm:text-5xl">
              <ContentText text={t("hero.heading")} />
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/coaching"
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-red-lux px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {t("hero.ctaCoaching")}
              </Link>
              <WhatsAppButton variant="outline" />
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-card border border-line bg-surface">
            <Image src="/logo-monogram-512.png" alt="" fill priority sizes="(max-width: 640px) 384px, 384px" className="object-contain p-10 opacity-90" />
            <div className="absolute inset-x-4 bottom-4">
              <ContentText text={t("hero.mediaAlt")} className="text-xs" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Coach */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold uppercase">{t("coach.heading")}</h2>
          <p className="mt-4 max-w-2xl text-ink-muted">
            <ContentText text={t("coach.body")} />
          </p>
          <Link href="/about" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-red-bright decoration-2 underline-offset-4 hover:decoration-red-lux focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
            {t("coach.link")}
          </Link>
        </div>
      </section>

      {/* 3. Disciplines */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold uppercase">{t("disciplinesSection.heading")}</h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            <ContentText text={t("disciplinesSection.intro")} />
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {DISCIPLINES.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/disciplines/${d.slug}`}
                  className="inline-flex min-h-11 items-center rounded-pill border border-line-input px-4 py-2 text-sm text-ink transition-colors duration-fast hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                >
                  {tn(`disciplinesList.${d.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Offres */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold uppercase">{t("offers.heading")}</h2>
          <p className="mt-3 text-ink-muted">{t("offers.sub")}</p>
          {withCapacity.length === 0 ? (
            <p className="mt-6 text-ink-muted">{t("offers.noOffers")}</p>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {withCapacity.map(({ offer, remaining }) => {
                const slug = OFFER_SLUGS.find((s) => OFFER_ROUTES[s].endsWith(offer.slug));
                return (
                  <Card key={offer.id} className="flex flex-col p-6">
                    <h3 className="font-display text-2xl font-bold uppercase">{offer.name}</h3>
                    <p className="mt-3 font-display text-4xl font-bold text-ink">
                      {nf.format(offer.price_da)} <span className="text-xl text-ink-muted">{t("offers.currency")}</span>
                    </p>
                    {offer.duration && (
                      <p className="mt-1 text-sm text-ink-muted">
                        {t("offers.durationLine", { duration: offer.duration })}
                      </p>
                    )}
                    {remaining !== null && (
                      <Badge variant={remaining > 0 ? "red" : "neutral"} className="mt-3 self-start">
                        {remaining} {t("offers.remaining")}
                      </Badge>
                    )}
                    {offer.inclusions && offer.inclusions.length > 0 && (
                      <ul className="mt-4 flex flex-col gap-1 text-sm text-ink-muted">
                        {offer.inclusions.map((inc) => (
                          <li key={inc}>{inc}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-6 flex flex-col gap-2 pt-2">
                      {slug && (
                        <Link
                          href={OFFER_ROUTES[slug]}
                          className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-input px-4 py-2 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                        >
                          {t("offers.cta")}
                        </Link>
                      )}
                      {slug && <WhatsAppButton offerSlug={slug} variant="primary" />}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 5. Méthode */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold uppercase">{t("method.heading")}</h2>
          <p className="mt-4 max-w-2xl text-ink-muted">
            <ContentText text={t("method.body")} />
          </p>
        </div>
      </section>

      {/* 6. Preuves (état vide honnête) */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold uppercase">{t("proofs.heading")}</h2>
          <p className="mt-4 text-ink-muted">{t("proofs.empty")}</p>
        </div>
      </section>

      {/* 7. FAQ */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold uppercase">{t("faqTeaser.heading")}</h2>
          <Accordion
            ariaLabel={t("faqTeaser.heading")}
            className="mt-6 max-w-3xl"
            items={[
              { value: "q1", title: t("faqTeaser.i1"), content: <ContentText text={t("faqTeaser.a1")} className="text-ink-muted" /> },
              { value: "q2", title: t("faqTeaser.i2"), content: <ContentText text={t("faqTeaser.a2")} className="text-ink-muted" /> },
              { value: "q3", title: t("faqTeaser.i3"), content: <ContentText text={t("faqTeaser.a3")} className="text-ink-muted" /> },
            ]}
          />
          <Link href="/faq" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-red-bright decoration-2 underline-offset-4 hover:decoration-red-lux focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
            {t("faqTeaser.link")}
          </Link>
        </div>
      </section>

      {/* 8. CTA final */}
      <section className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold uppercase">
              <ContentText text={t("finalCta.heading")} />
            </h2>
            <p className="mt-3 text-ink-muted">{t("finalCta.body")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className="inline-flex min-h-11 items-center justify-center rounded-control bg-red-lux px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
              {tn("contact")}
            </Link>
            <WhatsAppButton />
          </div>
        </div>
      </section>
    </main>
  );
}
