import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/site/reveal";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { OFFER_ROUTES, OFFER_SLUGS, type OfferSlug } from "@/lib/site/nav-data";
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
  const t = await getTranslations({ locale, namespace: "coaching" });
  return { title: t("metaTitle"), description: t("sub") };
}

const nf = new Intl.NumberFormat("fr-FR");

function slugFor(offerSlug: string): OfferSlug | undefined {
  return OFFER_SLUGS.find((s) => s === offerSlug);
}

export default async function CoachingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("coaching");
  const to = await getTranslations("offer");

  const offers = await getOffers();
  const withCapacity = await Promise.all(
    offers.map(async (offer) => ({ offer, remaining: await getOfferRemainingSlots(offer.id) })),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-red-bright">{t("kicker")}</p>
      <h1 className="mt-2 font-display text-4xl font-bold uppercase">{t("heading")}</h1>
      <p className="mt-4 max-w-2xl text-ink-muted">{t("sub")}</p>

      {withCapacity.length === 0 ? (
        <p className="mt-10 text-ink-muted">{t("noOffers")}</p>
      ) : (
        <Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {withCapacity.map(({ offer, remaining }) => {
              const slug = slugFor(offer.slug);
              const route = slug ? OFFER_ROUTES[slug] : undefined;
              return (
                <div key={offer.id} className="glass card-lift flex flex-col rounded-card p-6">
                  <h2 className="font-display text-2xl font-bold uppercase">{offer.name}</h2>
                  <p className="mt-3 font-display text-4xl font-bold text-ink">
                    {nf.format(offer.price_da)}{" "}
                    <span className="text-xl text-ink-muted">{to("currency")}</span>
                  </p>
                  {offer.duration && (
                    <p className="mt-1 text-sm text-ink-muted">
                      {to("durationLine", { duration: offer.duration })}
                    </p>
                  )}
                  {remaining !== null && (
                    <Badge variant={remaining > 0 ? "red" : "neutral"} className="mt-3 self-start">
                      {remaining} {to("remaining")}
                    </Badge>
                  )}
                  {offer.inclusions && offer.inclusions.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-1 text-sm text-ink-muted">
                      {offer.inclusions.map((inc) => (
                        <li key={inc}>{inc}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-xs text-ink-muted">{to("noAutoRenew")}</p>
                  <div className="mt-auto flex flex-col gap-2 pt-6">
                    {route && (
                      <Link
                        href={route}
                        className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-input px-4 py-2 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                      >
                        {t("cta")}
                      </Link>
                    )}
                    {slug && <WhatsAppButton offerSlug={slug} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      )}
    </main>
  );
}
