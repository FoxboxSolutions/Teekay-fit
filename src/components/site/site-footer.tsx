import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DISCIPLINES, OFFER_SLUGS } from "@/lib/site/nav-data";
import { Brand } from "@/components/site/brand";

const OFFER_HREFS: Record<(typeof OFFER_SLUGS)[number], string> = {
  starter: "/coaching/starter",
  online: "/coaching/online",
  "in-person": "/coaching/in-person",
};

/**
 * Pied de page (section 9 de l'accueil) : navigation, offres, disciplines,
 * liens légaux. Les liens vers les pages légales pointent vers les routes
 * /legal/* (contenu à fournir — build strict bloqué tant que placeholder).
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");

  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <Brand />
          <p className="mt-2 text-sm text-ink-muted">{t("tagline")}</p>
        </div>

        <nav aria-label={t("coaching")}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">{t("coaching")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {OFFER_SLUGS.map((slug) => (
              <li key={slug}>
                <Link
                  href={OFFER_HREFS[slug]}
                  className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                >
                  {t(`offers.${slug}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("disciplines")}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">{t("disciplines")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {DISCIPLINES.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/disciplines/${d.slug}`}
                  className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                >
                  {t(`disciplinesList.${d.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("legal")}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">{t("legal")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link href="/legal/privacy" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
                {t("privacy")}
              </Link>
            </li>
            <li>
              <Link href="/legal/terms" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
                {t("terms")}
              </Link>
            </li>
            <li>
              <Link href="/legal/refunds" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
                {t("refunds")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-ink-muted sm:px-6">
          {t("rights", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
