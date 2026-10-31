import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { OFFER_ROUTES, OFFER_SLUGS } from "@/lib/site/nav-data";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { isValidResultTokenFormat, lookupResult } from "@/lib/quiz/results";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("fr-FR");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "results" });
  // Résultat personnel : jamais indexé par les moteurs de recherche.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

const quizCtaClass =
  "mt-6 inline-flex min-h-11 items-center justify-center rounded-control border border-line-input px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright";

/**
 * Résultat du quiz (jeton opaque ≥ 128 bits, haché en base, expiration 72 h).
 * Jeton inconnu, expiré ou mal formé → page neutre identique (aucune fuite sur
 * l'existence d'un lead). Aucune donnée personnelle dans l'URL ni à l'écran.
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("results");

  // Limitation de débit en lecture (30 consultations / 10 min par IP hachée).
  const requestHeaders = await headers();
  const allowed = await checkRateLimit(
    ipRateLimitKey(requestHeaders, "quiz_result_ip"),
    30,
    600,
  );

  const result =
    allowed && isValidResultTokenFormat(token)
      ? await lookupResult(token)
      : ({ status: "missing" } as const);

  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold uppercase">{t("expiredHeading")}</h1>
          <p className="mt-3 text-ink-muted">{t("limitedBody")}</p>
          <Link href="/quiz" className={quizCtaClass}>
            {t("retryLink")}
          </Link>
        </Card>
      </main>
    );
  }

  if (result.status !== "found") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold uppercase">{t("expiredHeading")}</h1>
          <p className="mt-3 text-ink-muted">{t("expiredBody")}</p>
          <Link href="/quiz" className={quizCtaClass}>
            {t("retryLink")}
          </Link>
        </Card>
      </main>
    );
  }

  if (!result.offer) {
    // État vide honnête : aucune offre active au moment de la soumission.
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold uppercase">{t("emptyHeading")}</h1>
          <p className="mt-3 text-ink-muted">{t("emptyBody")}</p>
          <div className="mt-6">
            <WhatsAppButton />
          </div>
        </Card>
      </main>
    );
  }

  const { offer } = result;
  const routeSlug = OFFER_SLUGS.find((slug) => slug === offer.slug);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-sm uppercase tracking-widest text-red-bright">{t("kicker")}</p>
      <h1 className="mt-2 font-display text-4xl font-bold uppercase">{offer.name}</h1>
      <p className="mt-4 text-ink-muted">{t("intro")}</p>

      <Card className="mt-8 p-6">
        <p className="font-display text-4xl font-bold text-ink">
          {nf.format(offer.price_da)}{" "}
          <span className="text-xl text-ink-muted">{t("currency")}</span>
        </p>
        {offer.duration && (
          <p className="mt-1 text-sm text-ink-muted">
            {t("durationLine", { duration: offer.duration })}
          </p>
        )}
        {offer.description && <p className="mt-4 text-ink-muted">{offer.description}</p>}
        {offer.inclusions && offer.inclusions.length > 0 && (
          <ul className="mt-5 flex flex-col gap-1 text-sm text-ink-muted">
            {offer.inclusions.map((inclusion) => (
              <li key={inclusion}>{inclusion}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <WhatsAppButton offerSlug={routeSlug} />
          {routeSlug && (
            <Link
              href={OFFER_ROUTES[routeSlug]}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-input px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
            >
              {t("ctaCoaching")}
            </Link>
          )}
        </div>
      </Card>

      <Link href="/quiz" className={`${quizCtaClass} mt-8`}>
        {t("retryLink")}
      </Link>
    </main>
  );
}
