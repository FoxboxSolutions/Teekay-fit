import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";

/**
 * M9a — page d'accueil /admin :
 *  - garde aal2 (redirect /{locale}/admin/mfa si non signe / MFA manquant / session
 *    expiree ; neutre si pas admin) ;
 *  - indicateurs reels, « non disponible » quand la source fait défaut ;
 *  - metadata noindex.
 */
const guardCtx = vi.hoisted(() => ({ guard: null as null | Record<string, unknown> }));
const redirectCtx = vi.hoisted(() => ({ calls: [] as string[] }));
type IndStore = {
  newLeads: Indicator<number>;
  leadsToFollowUp: Indicator<{ count: number; totalActive: number }>;
  ordersCount: Indicator<number>;
  confirmedRevenue: Indicator<number>;
  paymentsVerifyingCount: Indicator<number>;
  quizCompletion: Indicator<{ started: number; completed: number; rate: number }>;
  conversionByOffer: Indicator<Array<{ offerSlug: string; leads: number; converted: number; rate: number }>>;
};
const indCtx = vi.hoisted(() => ({
  newLeads: { available: true, value: 5 },
  leadsToFollowUp: { available: true, value: { count: 2, totalActive: 4 } },
  ordersCount: { available: true, value: 3 },
  confirmedRevenue: { available: true, value: 12000 },
  paymentsVerifyingCount: { available: true, value: 1 },
  quizCompletion: { available: true, value: { started: 10, completed: 7, rate: 0.7 } },
  conversionByOffer: {
    available: true,
    value: [{ offerSlug: "starter", leads: 3, converted: 1, rate: 1 / 3 }],
  },
}) as IndStore);

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () => guardCtx.guard,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectCtx.calls.push(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/admin/indicators", () => ({
  newLeads: async () => indCtx.newLeads,
  leadsToFollowUp: async () => indCtx.leadsToFollowUp,
  ordersCount: async () => indCtx.ordersCount,
  confirmedRevenue: async () => indCtx.confirmedRevenue,
  paymentsVerifyingCount: async () => indCtx.paymentsVerifyingCount,
  quizCompletion: async () => indCtx.quizCompletion,
  conversionByOffer: async () => indCtx.conversionByOffer,
}));

import type { Indicator } from "@/lib/admin/indicators";

type PageModule = typeof import("@/app/[locale]/admin/page");
let page: PageModule["default"];
let generateMetadata: PageModule["generateMetadata"];

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: page, generateMetadata } = await import("@/app/[locale]/admin/page"));
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  guardCtx.guard = null;
  redirectCtx.calls = [];
  indCtx.newLeads = { available: true, value: 5 };
  indCtx.leadsToFollowUp = { available: true, value: { count: 2, totalActive: 4 } };
  indCtx.ordersCount = { available: true, value: 3 };
  indCtx.confirmedRevenue = { available: true, value: 12000 };
  indCtx.paymentsVerifyingCount = { available: true, value: 1 };
  indCtx.quizCompletion = { available: true, value: { started: 10, completed: 7, rate: 0.7 } };
  indCtx.conversionByOffer = {
    available: true,
    value: [{ offerSlug: "starter", leads: 3, converted: 1, rate: 1 / 3 }],
  };
});

describe("generateMetadata", () => {
  it("noindex (console admin)", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("t:title");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("page /admin — garde aal2", () => {
  it("sans session ⇒ redirect /{locale}/admin/mfa (redirection vers le defi MFA)", async () => {
    guardCtx.guard = { ok: false, status: 401, error: "unauthenticated" };
    await expect(page({ params })).rejects.toThrow("REDIRECT:/fr/admin/mfa");
    expect(redirectCtx.calls).toEqual(["/fr/admin/mfa"]);
  });

  it("session expiree (duree absolue depassee) ⇒ redirect /{locale}/admin/mfa", async () => {
    guardCtx.guard = { ok: false, status: 403, error: "session_expired" };
    await expect(page({ params })).rejects.toThrow("REDIRECT:/fr/admin/mfa");
  });

  it("second facteur manquant ⇒ redirect /{locale}/admin/mfa", async () => {
    guardCtx.guard = { ok: false, status: 403, error: "mfa_required" };
    await expect(page({ params })).rejects.toThrow("REDIRECT:/fr/admin/mfa");
  });

  it("connecte mais pas admin ⇒ affichage neutre, aucune donnee", async () => {
    guardCtx.guard = { ok: false, status: 403, error: "not_admin" };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:notAdmin");
    expect(json).not.toContain("t:indicators");
  });

  it("admin session aal2 ⇒ indicateurs rendus avec valeurs reelles", async () => {
    guardCtx.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:title");
    expect(json).toContain("5"); // nouveaux leads
    expect(json).toContain("2"); // leads a relancer : numerateur
    expect(json).toContain(" / "); // separateur numerateur/denominateur
    expect(json).toContain("4"); // leads a relancer : denominateur (pipeline actif)
    expect(json).toMatch(/12[\u202F\u00A0 ]000/); // revenu confirme (fr-FR)
    expect(json).toMatch(/70[\u202F\u00A0 ]%/); // taux completion quiz
    expect(json).not.toContain("t:notAdmin");
    expect(json).not.toContain("t:unavailable");
  });
});

describe("indicateurs indisponibles (jamais d'estimation)", () => {
  it("nouveaux leads indisponibles ⇒ « non disponible » rendue", async () => {
    guardCtx.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    indCtx.newLeads = { available: false, reason: "no_source" };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:unavailable");
    expect(json).not.toContain("5");
  });
});
