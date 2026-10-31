import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DISCIPLINES } from "@/lib/site/nav-data";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Brand } from "@/components/site/brand";

/**
 * En-tête du site public. Menu mobile via <details>/<summary> (HTML natif,
 * accessible au clavier, sans JavaScript) pour préserver la performance des
 * pages statiques.
 */
export async function SiteHeader() {
  const t = await getTranslations("nav");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
          aria-label={t("brand")}
        >
          <Image src="/logo-monogram-512.png" alt="" width={36} height={36} priority />
          <Brand />
        </Link>

        {/* Navigation bureau */}
        <nav className="hidden items-center gap-6 md:flex" aria-label={t("primary")}>
          <Link href="/" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
            {t("home")}
          </Link>
          <Link href="/coaching" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
            {t("coaching")}
          </Link>
          <Link href="/quiz" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
            {t("quiz")}
          </Link>
          <details className="relative">
            <summary className="cursor-pointer list-none text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
              {t("disciplines")}
            </summary>
            <ul className="absolute end-0 z-40 mt-2 w-48 rounded-card border border-line bg-surface-raised p-2 shadow-pop">
              {DISCIPLINES.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/disciplines/${d.slug}`}
                    className="block rounded-control px-3 py-2 text-sm text-ink-muted transition-colors duration-fast hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                  >
                    {t(`disciplinesList.${d.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
          <Link href="/about" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
            {t("about")}
          </Link>
          <Link href="/faq" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
            {t("faq")}
          </Link>
          <Link href="/contact" className="text-sm text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright">
            {t("contact")}
          </Link>
          <WhatsAppButton variant="outline" className="px-4 py-2" />
        </nav>

        {/* Menu mobile natif (sans JS) */}
        <details className="md:hidden">
          <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-control border border-line-input text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright" aria-label={t("menu")}>
            <span aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 6h14M3 10h14M3 14h14" />
              </svg>
            </span>
          </summary>
          <nav
            aria-label={t("primary")}
            className="absolute inset-x-0 top-full z-40 border-b border-line bg-canvas px-4 py-4"
          >
            <ul className="flex flex-col gap-1">
              {              [
                { href: "/", key: "home" },
                { href: "/coaching", key: "coaching" },
                { href: "/quiz", key: "quiz" },
                { href: "/about", key: "about" },
                { href: "/faq", key: "faq" },
                { href: "/contact", key: "contact" },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-control px-3 py-3 text-ink-muted transition-colors duration-fast hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                  >
                    {t(item.key)}
                  </Link>
                </li>
              ))}
              <li className="mt-2 border-t border-line pt-2">
                <span className="px-3 text-xs uppercase tracking-wide text-ink-muted">
                  {t("disciplines")}
                </span>
                <ul className="mt-1 flex flex-col">
                  {DISCIPLINES.map((d) => (
                    <li key={d.slug}>
                      <Link
                        href={`/disciplines/${d.slug}`}
                        className="block rounded-control px-3 py-2 text-sm text-ink-muted transition-colors duration-fast hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright"
                      >
                        {t(`disciplinesList.${d.key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
