import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { DISCIPLINES, OFFER_SLUGS } from "@/lib/site/nav-data";

const appDir = path.resolve(import.meta.dirname, "../src/app/[locale]/(public)");

function pageExists(rel: string): boolean {
  return existsSync(path.join(appDir, rel, "page.tsx"));
}

describe("routes publiques (smoke statique)", () => {
  it("toutes les routes PRD §7 existent", () => {
    const routes = [
      "", // accueil
      "about",
      "coaching",
      "faq",
      "contact",
    ];
    for (const r of routes) {
      expect(pageExists(r), `route manquante: /${r}`).toBe(true);
    }
  });

  it("chaque offre a sa page de vente (route dynamique [slug] couvrant les offres)", () => {
    expect(pageExists("coaching/[slug]"), "route coaching/[slug] manquante").toBe(true);
    expect(OFFER_SLUGS.length).toBeGreaterThan(0);
  });

  it("chaque discipline a sa page (route dynamique [slug] couvrant les disciplines)", () => {
    expect(pageExists("disciplines/[slug]"), "route disciplines/[slug] manquante").toBe(true);
    expect(DISCIPLINES.length).toBeGreaterThan(0);
  });

  it("les routes comingSoon, légales et checkout existent", () => {
    expect(pageExists("checkout/[offre]")).toBe(true);
    expect(pageExists("legal/[slug]")).toBe(true);
  });
});
