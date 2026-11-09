import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";

/**
 * M9a — page /admin/clients : garde aal2, liste clients, fiche client avec
 * commandes et drapeau PAR-Q (avis médical — jamais de réponses PAR-Q dans
 * le journal), metadata noindex.
 */
const guardCtx = vi.hoisted(() => ({ guard: null as null | Record<string, unknown> }));

const customers = [
  {
    id: "c-1",
    name: "Jean Dupont",
    phone: "+213 6 00 00 00 01",
    email: "jean@example.com",
    phone_norm: "+213600000001",
    created_at: "2026-10-01T10:00:00Z",
  },
  {
    id: "c-2",
    name: "Mina Chen",
    phone: "+213 5 00 00 00 02",
    email: null,
    phone_norm: "+213500000002",
    created_at: "2026-10-02T10:00:00Z",
  },
];

const orders = [
  {
    id: "o-1",
    customer_id: "c-1",
    reference: "TKF-2611-0001",
    status: "paid",
    total_da: 6000,
    created_at: "2026-10-10T10:00:00Z",
  },
  {
    id: "o-2",
    customer_id: "c-1",
    reference: "TKF-2611-0002",
    status: "pending_payment",
    total_da: 2000,
    created_at: "2026-10-15T10:00:00Z",
  },
];

const payments = [
  { order_id: "o-1", status: "confirmed", amount_da: 6000 },
  { order_id: "o-2", status: "pending", amount_da: 2000 },
];

const aptitudes = [
  {
    id: "a-1",
    order_id: "o-1",
    medical_advice_recommended: true,
    created_at: "2026-10-10T10:00:00Z",
  },
];

function makeDb(tableData: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const data = tableData[table] ?? [];
      let singleMode = false;
      const mods: Array<{ col: string; op: string; val: unknown }> = [];
      const apply = () => {
        let out = data;
        for (const m of mods) {
          out = out.filter((row) => {
            const cell = (row as Record<string, unknown>)[m.col];
            if (m.op === "eq") return cell === m.val;
            if (m.op === "in") return (m.val as unknown[]).includes(cell);
            return true;
          });
        }
        if (singleMode) return out.length ? out[0] : null;
        return out;
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => { mods.push({ col, op: "eq", val }); return chain; },
        in: (col: string, val: unknown[]) => { mods.push({ col, op: "in", val }); return chain; },
        order: () => chain,
        single: () => { singleMode = true; return chain; },
        then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: apply(), error: null }).then(onFulfilled),
      };
      return chain;
    },
  };
}

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () => guardCtx.guard,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => makeDb({ customers, orders, payments, aptitude_questionnaires: aptitudes }),
}));

type PageModule = typeof import("@/app/[locale]/admin/clients/page");
let page: PageModule["default"];
let generateMetadata: PageModule["generateMetadata"];

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: page, generateMetadata } = await import("@/app/[locale]/admin/clients/page"));
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  guardCtx.guard = null;
});

describe("generateMetadata", () => {
  it("noindex (console admin)", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("t:metaTitle");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("page /admin/clients — garde aal2", () => {
  it("sans session ⇒ redirect ./mfa", async () => {
    guardCtx.guard = { ok: false, status: 401, error: "unauthenticated" };
    await expect(page({ params, searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT|NEXT_REDIRECT/);
  });

  it("connecte mais pas admin ⇒ affichage neutre, aucun client", async () => {
    guardCtx.guard = { ok: false, status: 403, error: "not_admin" };
    const el = await page({ params, searchParams: Promise.resolve({}) });
    const json = JSON.stringify(el);
    expect(json).toContain("t:notAdmin");
    expect(json).not.toContain("Jean Dupont");
  });

  it("admin aal2 ⇒ liste des clients", async () => {
    guardCtx.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    const el = await page({ params, searchParams: Promise.resolve({}) });
    const json = JSON.stringify(el);
    expect(json).toContain("Jean Dupont");
    expect(json).toContain("Mina Chen");
  });

  it("fiche client : commandes et drapeau PAR-Q (avis médical, jamais les reponses)", async () => {
    guardCtx.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    const el = await page({ params, searchParams: Promise.resolve({ customer: "c-1" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("Jean Dupont");
    expect(json).toContain("TKF-2611-0001");
    expect(json).toContain("TKF-2611-0002");
    expect(json).toContain("t:parQRempli");
    expect(json).toContain("t:avisMedicalOui");
    // Les reponses PAR-Q (q1..q7) ne figurent pas dans le rendu.
    expect(json).not.toContain("q1");
  });

  it("fiche client sans questionnaire : PAR-Q non rempli", async () => {
    guardCtx.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    const el = await page({ params, searchParams: Promise.resolve({ customer: "c-2" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("Mina Chen");
    expect(json).toContain("t:parQNonRempli");
  });
});
