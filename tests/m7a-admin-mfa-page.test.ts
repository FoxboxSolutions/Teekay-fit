import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * M7a bloc 3 — page /admin/mfa (enrôlement + défi + codes de secours) :
 *  - sans session ⇒ message neutre « session requise » (aucun détail) ;
 *  - connecté non admin ⇒ « accès réservé » (jamais le panneau) ;
 *  - admin ⇒ panneau d'enrôlement (ou état aal2 actif si défi déjà passé) ;
 *  - metadata noindex (console admin, jamais indexée).
 */
const ctx = vi.hoisted(() => ({ auth: null as null | Record<string, unknown> }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: async () => ctx.auth,
}));

vi.mock("@/components/admin/mfa-panel", () => ({
  AdminMfaPanel: ({ alreadyVerified }: { alreadyVerified: boolean }) =>
    `AdminMfaPanel(alreadyVerified=${alreadyVerified})`,
}));

vi.mock("@/components/ui/card", () => ({ Card: () => null }));

type PageModule = typeof import("@/app/[locale]/admin/mfa/page");
let page: PageModule["default"];
let generateMetadata: PageModule["generateMetadata"];

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: page, generateMetadata } = await import("@/app/[locale]/admin/mfa/page"));
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  ctx.auth = null;
});

describe("generateMetadata — console admin jamais indexée", () => {
  it("robots index:false, follow:false", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("page /admin/mfa — garde serveur rejoué à chaque requête", () => {
  it("sans session ⇒ message neutre, AUCUN panneau", async () => {
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:notSignedIn");
    expect(json).not.toContain("AdminMfaPanel");
  });

  it("connecté non admin ⇒ refus « accès réservé », AUCUN panneau", async () => {
    ctx.auth = { userId: "u-2", isAdmin: false, hasMfa: false, aal2: false };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:notAdmin");
    expect(json).not.toContain("AdminMfaPanel");
  });

  it("admin session aal1 ⇒ panneau d'enrôlement (alreadyVerified=false)", async () => {
    ctx.auth = { userId: "u-1", isAdmin: true, hasMfa: false, aal2: false };
    const el = (await page({ params })) as {
      props: { children: { props: { alreadyVerified: boolean } } };
    };
    expect(el.props.children?.props.alreadyVerified).toBe(false);
  });

  it("admin session aal2 ⇒ panneau en état « session vérifiée » (alreadyVerified=true)", async () => {
    ctx.auth = { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true };
    const el = (await page({ params })) as {
      props: { children: { props: { alreadyVerified: boolean } } };
    };
    expect(el.props.children?.props.alreadyVerified).toBe(true);
  });
});
