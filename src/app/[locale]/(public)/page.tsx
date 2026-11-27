import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ContentText } from "@/components/site/content-text";
import { Reveal, RevealLine } from "@/components/site/reveal";
import { Parallax } from "@/components/site/parallax";
import { ZoomPhoto } from "@/components/site/zoom-photo";
import { HeroRise } from "@/components/site/hero-motion";
import { DisciplineMarquee } from "@/components/site/landing-motion";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
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

  // LCP : le visuel est dans le HTML initial avec fetchPriority="high"
  // (découvrable immédiatement). Pas de <link rel=preload imagesrcset> :
  // test Lighthouse A/B — ce preload n'améliorait pas la LCP observée et
  // brouillait l'attribution du nœud LCP (cf. rapport, tableau avant/après).

  const offers = await getOffers();
  const withCapacity = await Promise.all(
    offers.map(async (offer) => ({
      offer,
      remaining: await getOfferRemainingSlots(offer.id),
    })),
  );

  return (
    <main>
      {/* 2. Hero — contenu serveur visible ; E1 = îlot HeroRise (translateY
       *    seulement, opacité 1 constante : le titre et les CTA ne sont
       *    jamais masqués). Le visuel est du HTML serveur pur (LCP). */}
      <section className="relative overflow-hidden border-b border-line bg-canvas">
        <div aria-hidden="true" className="glow -top-24 end-[-8rem] size-96 md:-top-16 md:size-[28rem]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <HeroRise className="hero-rise inline-block" delay={0}>
              <p className="text-sm font-semibold uppercase tracking-widest text-red-bright">
                {t("hero.baseline")}
              </p>
            </HeroRise>
            <HeroRise className="hero-rise" delay={0.08}>
              <h1 className="hero-accent-title mt-4 text-5xl font-bold uppercase leading-[0.95] sm:text-6xl">
                <ContentText text={t("hero.heading")} />
              </h1>
            </HeroRise>
            {/* Wordmark de marque sous le titre : image lazy, sans
             *  fetchPriority — le monogramme reste le premier visuel et
             *  l'élément LCP. */}
            <HeroRise className="hero-rise" delay={0.12}>
              <picture className="hero-wordmark mt-3 block h-20 w-20 sm:h-24 sm:w-24">
                <source type="image/avif" srcSet="/images/brand/teekay-wordmark.avif" />
                <img
                  src="/images/brand/teekay-wordmark.webp"
                  width={800}
                  height={800}
                  alt={t("hero.wordmarkAlt")}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain"
                />
              </picture>
              {/* Signature manuscrite : décorative (alt vide, aria-hidden),
               *  statique, lazy et sans priorité — jamais concurrente du
               *  monogramme, élément LCP. */}
              <picture>
                <img
                  src="/images/brand/signature.svg"
                  alt=""
                  aria-hidden="true"
                  width={205}
                  height={50}
                  loading="lazy"
                  decoding="async"
                  className="hero-signature mt-1 block h-[50px] w-[205px] object-contain"
                />
              </picture>
            </HeroRise>
            <HeroRise className="hero-rise" delay={0.16}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/coaching"
                  className="inline-flex min-h-11 items-center justify-center rounded-control bg-red-lux px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {t("hero.ctaCoaching")}
                </Link>
                <Link
                  href="/quiz"
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-input px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                >
                  {t("hero.ctaQuiz")}
                </Link>
                <WhatsAppButton variant="outline" />
              </div>
            </HeroRise>
          </div>
          <div className="glass relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-card">
            <picture>
              <source
                type="image/avif"
                srcSet="/hero/monogram-256.avif 256w, /hero/monogram-512.avif 512w"
                sizes="(max-width: 640px) 384px, 384px"
              />
              {/* Repli WebP ; dimensions explicites (512×512), eager + haute priorité (LCP). */}
              <img
                src="/hero/monogram-512.webp"
                srcSet="/hero/monogram-256.webp 256w, /hero/monogram-512.webp 512w"
                sizes="(max-width: 640px) 384px, 384px"
                width={512}
                height={512}
                alt=""
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-contain p-10 opacity-90"
              />
            </picture>
            <div className="absolute inset-x-4 bottom-4">
              <ContentText text={t("hero.mediaAlt")} className="text-xs" />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Bande de confiance — faits vérifiables uniquement : disciplines
       *    pratiquées et formats d'offres publiés (lus depuis la base). Aucun
       *    chiffre, témoignage ou label inventé. Pas d'animation : bande
       *    informative. */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-muted">
            <li className="text-xs font-semibold uppercase tracking-widest text-ink">
              {t("trust.disciplinesLabel")}
            </li>
            {DISCIPLINES.map((d) => (
              <li key={d.slug}>{tn(`disciplinesList.${d.key}`)}</li>
            ))}
          </ul>
          {offers.length > 0 && (
            <ul className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-muted">
              <li className="text-xs font-semibold uppercase tracking-widest text-ink">
                {t("trust.formatsLabel")}
              </li>
              {offers.map((offer) => (
                <li key={offer.id}>{offer.name}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Mouvement additionnel : bandes de disciplines, sens opposés, sans JS. */}
      <DisciplineMarquee />

      {/* 5. Disciplines — grille de 5 cartes (hover lift E3), nom = fait
       *    vérifiable (PRD §7) ; aucune description inventée. */}
      <section className="border-b border-line bg-surface">
        <Reveal>
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-text">{t("kickers.disciplines")}</p>
            <h2 className="mt-2 font-display text-3xl font-bold uppercase">{t("disciplinesSection.heading")}</h2>
            <p className="mt-3 max-w-2xl text-ink-muted">
              <ContentText text={t("disciplinesSection.intro")} />
            </p>
            <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {DISCIPLINES.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/disciplines/${d.slug}`}
                    className="glass card-lift flex min-h-24 items-center justify-center rounded-card px-4 text-center font-display text-xl font-bold uppercase text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {tn(`disciplinesList.${d.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* 6. Méthode — 3 étapes (Évaluer, Programmer, Suivre) ; les titres
       *    sont fixés par le PRD, les détails restent des placeholders. */}
      <section className="border-b border-line">
        <Reveal>
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-bright">{t("kickers.method")}</p>
            <h2 className="mt-2 font-display text-3xl font-bold uppercase">{t("method.heading")}</h2>
            <p className="mt-4 max-w-2xl text-ink-muted">
              <ContentText text={t("method.body")} />
            </p>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { n: "01", title: t("method.step1Title"), body: t("method.step1Body") },
                { n: "02", title: t("method.step2Title"), body: t("method.step2Body") },
                { n: "03", title: t("method.step3Title"), body: t("method.step3Body") },
              ].map((step) => (
                <li key={step.n} className="glass rounded-card p-6">
                  <p className="font-display text-5xl font-bold leading-none text-red-text">{step.n}</p>
                  <h3 className="mt-3 font-display text-2xl font-bold uppercase">{step.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted">
                    <ContentText text={step.body} />
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </section>

      {/* 7. Offres — cartes lues depuis la base (prix, inclusions,
       *    disponibilité), révélée échelonnée (E2). Le titre (contenu
       *    critique) reste statique : un seul niveau d'animation. */}
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="glow -bottom-40 start-[-10rem] size-[26rem]" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-bright">{t("kickers.offers")}</p>
          {/* Titre d'accent (principe 3) : seul h2 de la page qui n'est pas
           *  déjà dans un <Reveal> (un seul niveau d'animation), mot unique
           *  (« Offres ») donc une seule ligne au masque aux trois viewports,
           *  et section sous la ligne de flottaison partout (mesuré). */}
          <h2 className="mt-2 font-display text-3xl font-bold uppercase">
            <RevealLine>{t("offers.heading")}</RevealLine>
          </h2>
          <p className="mt-3 text-ink-muted">{t("offers.sub")}</p>
          {withCapacity.length === 0 ? (
            <p className="mt-6 text-ink-muted">{t("offers.noOffers")}</p>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-3">
                {withCapacity.map(({ offer, remaining }, index) => {
                  const slug = OFFER_SLUGS.find((s) => OFFER_ROUTES[s].endsWith(offer.slug));
                  return (
                    <Reveal key={offer.id} delay={index * 0.08}>
                      <div className="glass card-lift flex h-full flex-col rounded-card p-6">
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
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            )}
          </div>
      </section>

      {/* 4. Présentation du coach — déplacée après les offres pour que la
       *    photo secondaire soit sous la marge de préchargement du navigateur.
       *    Photo et textes en placeholders visibles ([À FOURNIR …]), aucune
       *    affirmation inventée. */}
      <section className="border-b border-line">
        <Reveal>
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <div className="grid items-start gap-8 md:grid-cols-[auto_1fr]">
              {/* Photo secondaire : composant serveur, chargée en lazy,
               *  jamais l'image LCP (le monogramme du hero garde la
               *  priorité). Zoom-out CSS borné, sans JavaScript. */}
              <ZoomPhoto
                alt={t("coach.photoAlt")}
                className="h-48 w-48 rounded-card"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-red-bright">{t("kickers.coach")}</p>
                <h2 className="mt-2 font-display text-3xl font-bold uppercase">{t("coach.heading")}</h2>
                <p className="mt-4 max-w-2xl text-ink-muted">
                  <ContentText text={t("coach.body")} />
                </p>
                <h3 className="mt-6 font-display text-xl font-bold uppercase tracking-wide">
                  {t("coach.qualificationsHeading")}
                </h3>
                <p className="mt-2 max-w-2xl text-ink-muted">
                  <ContentText text={t("coach.qualificationsBody")} />
                </p>
                <Link
                  href="/about"
                  className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-red-bright decoration-2 underline-offset-4 hover:decoration-red-lux focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {t("coach.link")}
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 8. Preuves — état vide honnête : rien n'est publié, rien n'est
       *    inventé. */}
      <section className="border-b border-line">
        <Reveal>
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-bright">{t("kickers.proofs")}</p>
            <h2 className="mt-2 font-display text-3xl font-bold uppercase">{t("proofs.heading")}</h2>
            <p className="mt-4 text-ink-muted">{t("proofs.empty")}</p>
          </div>
        </Reveal>
      </section>

      {/* 9. FAQ — accordéon Radix existant. */}
      <section className="border-b border-line bg-surface">
        <Reveal>
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-text">{t("kickers.faq")}</p>
            <h2 className="mt-2 font-display text-3xl font-bold uppercase">{t("faqTeaser.heading")}</h2>
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
        </Reveal>
      </section>

      {/* 10. CTA final — panneau glass + halo, cohérent avec le hero. */}
      <section className="border-b border-line">
        <Reveal>
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <div className="glass relative overflow-hidden rounded-card px-6 py-12 sm:px-10 md:px-14">
              {/* Halo décoratif en parallaxe (principe 2) : purement décoratif
               *  (aria-hidden), hors du premier écran aux trois viewports,
               *  amplitude 14 px. */}
              <Parallax className="absolute -top-32 end-[-6rem] size-96" amplitude={14} ariaHidden>
                <div className="glow absolute inset-0" />
              </Parallax>
              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
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
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
