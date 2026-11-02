import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { DISCIPLINES, OFFER_ROUTES, OFFER_SLUGS } from "@/lib/site/nav-data";

/**
 * sitemap.xml — pages publiques statiques uniquement (jamais /results/[jeton],
 * /checkout/*, /design-system). Existe pour que robots.txt production
 * pointe vers une cible réelle ; hors production, robots.txt Disallow : /
 * suffit à écarter le site des indexations.
 */
const LEGAL_SLUGS = ["privacy", "terms", "refunds"] as const;

const PATHS = [
  "/",
  "/about",
  "/coaching",
  "/quiz",
  "/contact",
  "/faq",
  ...DISCIPLINES.map((d) => `/disciplines/${d.slug}`),
  ...OFFER_SLUGS.map((slug) => OFFER_ROUTES[slug]),
  ...LEGAL_SLUGS.map((slug) => `/legal/${slug}`),
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const lastModified = new Date();

  return routing.locales.flatMap((locale) =>
    PATHS.map((path) => ({
      url: `${base}/${locale}${path === "/" ? "" : path}`,
      lastModified,
    })),
  );
}
