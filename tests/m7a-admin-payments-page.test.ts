import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * M7a bloc 4 — page /admin/payments :
 *  - sans admin ou sans aal2 ⇒ message « défi MFA requis », liens vers
 *    /fr/admin/mfa, AUCUNE liste de paiements rendue (aucun montant ni
 *    preuve exposé sans second facteur) ;
 *  - admin aal2 ⇒ liste rendue ;
 *  - metadata noindex.
 */
const ctx = vi.hoisted(() => ({ auth: null as null | Record<string, unknown> }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: async () => ctx.auth,
}));

vi.mock("@/components/admin/payments-list", () => ({
  AdminPaymentsList: () => "PaymentsListRendered",
}));

vi.mock("@/components/ui/card", () => ({ Card: () => null }));

type PageModule = typeof import("@/app/[locale]/admin/payments/page");
let page: PageModule["default"];
let generateMetadata: PageModule["generateMetadata"];

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: page, generateMetadata } = await import("@/app/[locale]/admin/payments/page"));
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  ctx.auth = null;
});

describe("generateMetadata", () => {
  it("noindex (console admin)", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("page /admin/payments — aal2 exigé pour l'affichage", () => {
  it("sans session ⇒ MFA requis, AUCUNE liste", async () => {
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:mfaRequired");
    expect(json).toContain("t:goMfa");
    expect(json).not.toContain("PaymentsListRendered");
  });

  it("connecté non admin ⇒ MFA requis, AUCUNE liste", async () => {
    ctx.auth = { userId: "u-2", isAdmin: false, hasMfa: false, aal2: false };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:mfaRequired");
    expect(json).not.toContain("PaymentsListRendered");
  });

  it("admin avec facteur mais session aal1 ⇒ MFA requis, AUCUNE liste (test nommé : sans aal2 rien n'est accessible)", async () => {
    ctx.auth = { userId: "u-1", isAdmin: true, hasMfa: true, aal2: false };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:mfaRequired");
    expect(json).not.toContain("PaymentsListRendered");
  });

  it("admin session aal2 ⇒ page de vérification rendue (titre + API liste branchée)", async () => {
    ctx.auth = { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:listTitle");
    expect(json).not.toContain("t:mfaRequired");
  });
});
