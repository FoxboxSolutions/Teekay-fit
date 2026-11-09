import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";

/**
 * M9a — page /admin/a-traiter :
 *  - garde aal2 ; leads du jour, paiements verifying, commandes a
 *    revoir, echecs outbox, drapeaux avis medical (PAR-Q) ;
 *  - donnees reelles, etats vides explicites ; metadata noindex.
 */
const nowIso = new Date().toISOString();

type TableRow = Record<string, unknown>;
interface Tables {
  [key: string]: TableRow[];
  leads: TableRow[];
  payments: TableRow[];
  orders: TableRow[];
  email_outbox: TableRow[];
  aptitude_questionnaires: TableRow[];
}
const tables: Tables = {
  leads: [
    { id: "lt1", name: "Jean Dupont", phone: "+213 6 00 00 00 01", source: "quiz", status: "new", created_at: nowIso },
    { id: "lt2", name: "Mina Chen", phone: "+213 5 00 00 00 02", source: "contact", status: "contacted", created_at: nowIso },
  ],
  payments: [
    { id: "pv1", order_id: "TKF-2611-0005", amount_da: 6000, status: "verifying", created_at: nowIso },
  ],
  orders: [
    { id: "or1", reference: "TKF-2611-0009", total_da: 10000, status: "pending_payment", needs_admin_review: true, created_at: nowIso },
  ],
  email_outbox: [
    { id: "e1", payment_id: "p1", event_type: "payment_confirmed", recipient: "client@example.com", status: "failed", attempts: 3, last_error: "smtp timeout", created_at: nowIso },
  ],
  aptitude_questionnaires: [
    { id: "m1", order_id: "TKF-2611-0009", medical_advice_recommended: true, created_at: nowIso },
  ],
};

const guardState = { guard: null as null | Record<string, unknown> };
const redirectState = { calls: [] as string[] };

function makeFakeSupabase(tableData: Tables) {
  return {
    from: (table: string) => {
      const rows = (tableData[table] ?? []) as unknown[];
      const mods: Array<{ col: string; op: string; val: unknown }> = [];
      const apply = () => {
        let out = rows;
        for (const m of mods) {
          out = out.filter((row) => {
            const cell = (row as Record<string, unknown>)[m.col];
            switch (m.op) {
              case "gte": return new Date(cell as string) >= new Date(m.val as string);
              case "lt": return new Date(cell as string) < new Date(m.val as string);
              case "eq": return cell === m.val;
              default: return true;
            }
          });
        }
        return { data: out, error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        gte: (col: string, val: unknown) => { mods.push({ col, op: "gte", val }); return chain; },
        lt: (col: string, val: unknown) => { mods.push({ col, op: "lt", val }); return chain; },
        eq: (col: string, val: unknown) => { mods.push({ col, op: "eq", val }); return chain; },
        order: () => chain,
        then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve(apply()).then(onFulfilled),
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
  requireAdminAal2: async () => guardState.guard,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectState.calls.push(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => makeFakeSupabase(tables),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => makeFakeSupabase(tables),
}));

type PageModule = typeof import("@/app/[locale]/admin/a-traiter/page");
let page: PageModule["default"];
let generateMetadata: PageModule["generateMetadata"];

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: page, generateMetadata } = await import("@/app/[locale]/admin/a-traiter/page"));
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  guardState.guard = null;
  redirectState.calls = [];
});

describe("generateMetadata", () => {
  it("noindex (console admin)", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("t:metaTitle");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("page /admin/a-traiter — garde aal2", () => {
  it("sans session ⇒ redirect ./mfa", async () => {
    guardState.guard = { ok: false, status: 401, error: "unauthenticated" };
    await expect(page({ params })).rejects.toThrow("REDIRECT:./mfa");
  });

  it("connecte mais pas admin ⇒ affichage neutre, aucune donnee", async () => {
    guardState.guard = { ok: false, status: 403, error: "not_admin" };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:notAdmin");
    expect(json).not.toContain("Jean Dupont");
    expect(json).not.toContain("TKF-2611-0009");
  });

  it("admin session aal2 ⇒ toutes les listes a traiter rendues avec donnees reelles", async () => {
    guardState.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).toContain("t:title");
    expect(json).toContain("Jean Dupont");
    expect(json).toContain("Mina Chen");
    expect(json).toContain("TKF-2611-0005");
    expect(json).toContain("6000");
    expect(json).toContain("TKF-2611-0009");
    expect(json).toContain("10000");
    expect(json).toContain("client@example.com");
    expect(json).toContain("3"); // tentatives outbox
  });

  it("etats vides ⇒ « Aucun element » dans chaque section, aucune donnee", async () => {
    guardState.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    const saved = tables;
    tables.leads = [];
    tables.payments = [];
    tables.orders = [];
    tables.email_outbox = [];
    tables.aptitude_questionnaires = [];
    const el = await page({ params });
    const json = JSON.stringify(el);
    expect(json).not.toContain("Jean Dupont");
    expect(json).not.toContain("client@example.com");
    expect((json.match(/t:empty/g) ?? []).length).toBeGreaterThanOrEqual(5);
    tables.leads = saved.leads;
    tables.payments = saved.payments;
    tables.orders = saved.orders;
    tables.email_outbox = saved.email_outbox;
    tables.aptitude_questionnaires = saved.aptitude_questionnaires;
  });
});
