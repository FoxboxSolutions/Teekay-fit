import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M6 — page de suivi /fr/orders/status (complément au test lib m6-order-status) :
 *  - metadata : noindex quoi qu'il arrive (jeton absent, invalide ou valide) ;
 *  - sans jeton, jeton invalide, jeton inconnu ou rate limit → page neutre
 *    IDENTIQUE (aucune différence observable) ;
 *  - validité + rate limit acceptées avant toute lecture base.
 */
type PageModule = typeof import("@/app/[locale]/(public)/orders/status/page");

const rateLimit = vi.hoisted(() => ({ allowed: true }));
const lookup = vi.hoisted(() => ({ result: { status: "missing" } as unknown }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => rateLimit.allowed,
  ipRateLimitKey: () => "order_status_ip:hash",
}));

vi.mock("@/lib/orders/status", () => ({
  isValidOrderStatusTokenFormat: (t: string) => t.length >= 16,
  lookupOrderStatus: async () => lookup.result,
}));

vi.mock("@/components/site/whatsapp-button", () => ({
  WhatsAppButton: () => null,
}));

vi.mock("@/lib/settings", () => ({
  getBaridimobInstructions: async () => ({ account: null, bank: null, beneficiary: null, note: null }),
  getPaymentWindowHours: async () => 48,
  isPaymentWindowExpired: () => false,
}));

const page = (await import("@/app/[locale]/(public)/orders/status/page")) as PageModule;

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;
const sp = (token?: string) =>
  Promise.resolve({ token }) as Promise<{ token?: string }>;

beforeEach(() => {
  rateLimit.allowed = true;
  lookup.result = { status: "missing" };
});

describe("generateMetadata — noindex", () => {
  it("robots index:false, follow:false, quel que soit le contexte", async () => {
    const meta = await page.generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe("t:metaTitle");
  });
});

describe("page neutre — aucun oracle", () => {
  it("jeton absent, invalide, inconnu et rate limit → contenu neutre identique (t:neutralTitle)", async () => {
    const cases: Array<{ token?: string; limited?: boolean }> = [
      { token: undefined },
      { token: "court" },
      { token: "a".repeat(43) }, // valide en forme, inconnu (missing)
      { token: "a".repeat(43), limited: true }, // rate limit
    ];
    const renders = [];
    for (const c of cases) {
      rateLimit.allowed = !c.limited;
      lookup.result = { status: "missing" };
      const el = await page.default({ params, searchParams: sp(c.token) });
      renders.push(JSON.stringify(el));
    }
    expect(new Set(renders).size).toBe(1); // strictement identiques
    expect(renders[0]).toContain("t:neutralTitle");
  });

  it("jeton valide + rate limit OK → détail : référence, statut, montant (namespace order.status)", async () => {
    lookup.result = {
      status: "found",
      order: {
        reference: "TKF-2601-AB34",
        order_status: "paid",
        total_da: 2000,
        created_at: "2026-11-03T10:00:00Z",
        status_token_expires_at: "2026-11-17T10:00:00Z",
      },
    };
    const el = await page.default({ params, searchParams: sp("a".repeat(43)) });
    const json = JSON.stringify(el);
    expect(json).toContain("TKF-2601-AB34");
    expect(json).toContain("t:paid");
    expect(json).toContain("t:reference");
    // la page neutre n'apparaît pas
    expect(json).not.toContain("t:neutralTitle");
  });

  it("statut interne non exposé (registre) → libellé neutre pending_payment, jamais de détail technique", async () => {
    lookup.result = {
      status: "found",
      order: {
        reference: "TKF-2601-AB34",
        order_status: "un_statut_interne",
        total_da: 2000,
        created_at: "2026-11-03T10:00:00Z",
        status_token_expires_at: "2026-11-17T10:00:00Z",
      },
    };
    const el = await page.default({ params, searchParams: sp("a".repeat(43)) });
    const json = JSON.stringify(el);
    expect(json).toContain("t:pending_payment");
    expect(json).not.toContain("un_statut_interne");
  });
});
