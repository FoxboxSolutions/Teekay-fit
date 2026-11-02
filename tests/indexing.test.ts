import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// next-intl (dépendance externalisée) importe « next/server » sans suffixe de
// fichier : injoignable depuis Node ESM dans vitest. Le routage i18n n'est pas
// le sujet ici — on teste l'en-tête X-Robots-Tag ajouté par proxy().
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

/**
 * Audit M4 (d) — indexation pilotée par APP_ENV :
 *  - robots.txt : Allow + sitemap en production explicite, Disallow / sinon ;
 *  - proxy : en-tête X-Robots-Tag noindex, nofollow hors production ;
 *  - /api/health expose appEnv (voir tests/offers-health.test.ts).
 * Les 5 cas : development, preview, production, absente, invalide.
 */

type RobotsModule = typeof import("@/app/robots");
type SitemapModule = typeof import("@/app/sitemap");
type ProxyModule = typeof import("@/proxy");

let robots: RobotsModule["default"];
let sitemap: SitemapModule["default"];
let proxy: ProxyModule["default"];

const savedEnv = {
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

beforeAll(async () => {
  ({ default: robots } = await import("@/app/robots"));
  ({ default: sitemap } = await import("@/app/sitemap"));
  ({ default: proxy } = await import("@/proxy"));
});

afterAll(() => {
  restore("APP_ENV", savedEnv.APP_ENV);
  restore("NEXT_PUBLIC_APP_URL", savedEnv.NEXT_PUBLIC_APP_URL);
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function setEnv(appEnv: string | undefined, appUrl: string | undefined = "https://teekay.fit") {
  restore("APP_ENV", appEnv);
  restore("NEXT_PUBLIC_APP_URL", appUrl);
}

const CASES: ReadonlyArray<["development" | "preview" | "production" | "absent" | "invalid", string | undefined]> = [
  ["development", "development"],
  ["preview", "preview"],
  ["production", "production"],
  ["absent", undefined],
  ["invalid", "staging"],
];

/** Les 4 valeurs non-production (production testée à part). */
const NON_PROD: ReadonlyArray<["development" | "preview" | "absent" | "invalid", string | undefined]> = [
  ["development", "development"],
  ["preview", "preview"],
  ["absent", undefined],
  ["invalid", "staging"],
];

describe("robots.txt — Disallow hors production, Allow + sitemap en production", () => {
  it.each(NON_PROD)("%s ⇒ Disallow /", (_label, value) => {
    setEnv(value);
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", disallow: "/" }],
    });
  });

  it("production ⇒ Allow / + sitemap NEXT_PUBLIC_APP_URL/sitemap.xml", () => {
    setEnv("production", "https://teekay.fit");
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", allow: "/" }],
      sitemap: "https://teekay.fit/sitemap.xml",
    });
  });
});

describe("sitemap — pages publiques statiques, /fr uniquement", () => {
  it("contient les pages statiques pour la locale fr, sans pages privées", () => {
    setEnv("production");
    const entries = sitemap();

    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://teekay.fit/fr");
    expect(urls).toContain("https://teekay.fit/fr/coaching/online");
    expect(urls).toContain("https://teekay.fit/fr/disciplines/hyrox");
    expect(urls).toContain("https://teekay.fit/fr/legal/privacy");
    // Jamais de pages privées ou non indexables.
    expect(urls.some((u) => u.includes("/results/"))).toBe(false);
    expect(urls.some((u) => u.includes("/checkout/"))).toBe(false);
    expect(urls.some((u) => u.includes("/design-system"))).toBe(false);
  });
});

describe("proxy — X-Robots-Tag hors production (5 cas)", () => {
  beforeEach(() => {
    setEnv(undefined);
  });

  afterEach(() => {
    setEnv(savedEnv.APP_ENV, savedEnv.NEXT_PUBLIC_APP_URL);
  });

  function headerFor(appEnv: string | undefined): string | null {
    setEnv(appEnv, "http://localhost:3000");
    const res = proxy(new NextRequest("http://localhost:3000/fr"));
    return res.headers.get("X-Robots-Tag");
  }

  it.each(CASES)("%s ⇒ %s", (_label, value) => {
    const expected = value === "production" ? null : "noindex, nofollow";
    expect(headerFor(value)).toBe(expected);
  });
});
