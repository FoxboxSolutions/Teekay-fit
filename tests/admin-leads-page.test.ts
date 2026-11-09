import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";

/**
 * M9a — page /admin/leads : garde aal2, recherche nom/téléphone, filtres
 * statut/source/offre/relance, états vides, metadata noindex.
 */
const guardCtx = vi.hoisted(() => ({ guard: null as null | Record<string, unknown> }));

const nowIso = new Date().toISOString();

const rows = [
  {
    id: "l-1", name: "Jean Dupont", phone: "+213 6 00 00 00 01", phone_norm: "+213600000001",
    email: "jean@example.com", source: "quiz", offer_slug: "starter", status: "new",
    next_follow_up_at: nowIso, notes: null, created_at: nowIso,
  },
  {
    id: "l-2", name: "Mina Chen", phone: "+213 5 00 00 00 02", phone_norm: "+213500000002",
    email: "mina@example.com", source: "contact", offer_slug: "online", status: "contacted",
    next_follow_up_at: null, notes: null, created_at: nowIso,
  },
  {
    id: "l-3", name: "Samir Belkacem", phone: "+213 4 00 00 00 03", phone_norm: "+213400000003",
    email: "samir@example.com", source: "quiz", offer_slug: "in-person", status: "lost",
    next_follow_up_at: null, notes: null, created_at: nowIso,
  },
];

function makeDb(tableRows: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const data = tableRows[table] ?? [];
      let singleMode = false;
      const mods: Array<{ col: string; op: string; val: unknown }> = [];
      const apply = () => {
        let out = data;
        for (const m of mods) {
          out = out.filter((row) => {
            const cell = (row as Record<string, unknown>)[m.col];
            if (m.op === "eq") return cell === m.val;
            if (m.op === "gte") return new Date(cell as string) >= new Date(m.val as string);
            if (m.op === "lt") return new Date(cell as string) < new Date(m.val as string);
            if (m.op === "ilike") {
              const pat = (m.val as string).replace(/^%|%$/g, "");
              return String(cell ?? "").toLowerCase().includes(pat.toLowerCase());
            }
            if (m.op === "or") {
              const conds = (m.val as string).split(",");
              return conds.some((c) => {
                const [col, , pat] = c.split(".") as [string, string, string];
                const v = String((row as Record<string, unknown>)[col] ?? "").toLowerCase();
                return v.includes(pat.replace(/^%|%$/g, "").toLowerCase());
              });
            }
            if (m.op === "not") return true;
            return true;
          });
        }
        return singleMode ? (out.length ? out[0] : null) : out;
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => { mods.push({ col, op: "eq", val }); return chain; },
        not: () => chain,
        is: () => chain,
        gte: (col: string, val: unknown) => { mods.push({ col, op: "gte", val }); return chain; },
        lt: (col: string, val: unknown) => { mods.push({ col, op: "lt", val }); return chain; },
        ilike: (col: string, val: unknown) => { mods.push({ col, op: "ilike", val }); return chain; },
        or: (filter: string) => { mods.push({ col: "__or__", op: "or", val: filter }); return chain; },
        limit: () => chain,
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
  createSupabaseServerClient: () => makeDb({ leads: rows }),
}));

type PageModule = typeof import("@/app/[locale]/admin/leads/page");
let page: PageModule["default"];
let generateMetadata: PageModule["generateMetadata"];

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

beforeAll(async () => {
  ({ default: page, generateMetadata } = await import("@/app/[locale]/admin/leads/page"));
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

describe("page /admin/leads — garde aal2", () => {
  it("sans session ⇒ redirect ./mfa", async () => {
    guardCtx.guard = { ok: false, status: 401, error: "unauthenticated" };
    await expect(page({ params, searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT|NEXT_REDIRECT/);
  });

  it("session expirée ⇒ redirect ./mfa", async () => {
    guardCtx.guard = { ok: false, status: 403, error: "session_expired" };
    await expect(page({ params, searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT|NEXT_REDIRECT/);
  });

  it("connecté mais pas admin ⇒ affichage neutre, aucun lead", async () => {
    guardCtx.guard = { ok: false, status: 403, error: "not_admin" };
    const el = await page({ params, searchParams: Promise.resolve({}) });
    const json = JSON.stringify(el);
    expect(json).toContain("t:notAdmin");
    expect(json).not.toContain("Jean Dupont");
    expect(json).not.toContain("Mina Chen");
  });

  it("admin aal2 ⇒ liste complète rendue", async () => {
    guardCtx.guard = {
      ok: true,
      auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
    };
    const el = await page({ params, searchParams: Promise.resolve({}) });
    const json = JSON.stringify(el);
    expect(json).toContain("Jean Dupont");
    expect(json).toContain("Mina Chen");
    expect(json).toContain("Samir Belkacem");
    expect(json).toContain("t:statusNew");
    expect(json).toContain("t:statusContacted");
    expect(json).toContain("t:statusLost");
  });

  it("recherche par nom filtre les leads", async () => {
    guardCtx.guard = { ok: true, auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" } };
    const el = await page({ params, searchParams: Promise.resolve({ search: "Dupont" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("Jean Dupont");
    expect(json).not.toContain("Mina Chen");
    expect(json).not.toContain("Samir Belkacem");
  });

  it("recherche par téléphone normalisé filtre les leads", async () => {
    guardCtx.guard = { ok: true, auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" } };
    const el = await page({ params, searchParams: Promise.resolve({ search: "600000001" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("Jean Dupont");
    expect(json).not.toContain("Mina Chen");
  });

  it("filtre statut ne garde que les leads concernés", async () => {
    guardCtx.guard = { ok: true, auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" } };
    const el = await page({ params, searchParams: Promise.resolve({ status: "contacted" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("Mina Chen");
    expect(json).not.toContain("Jean Dupont");
    expect(json).not.toContain("Samir Belkacem");
  });

  it("filtre source garde les leads de la source", async () => {
    guardCtx.guard = { ok: true, auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" } };
    const el = await page({ params, searchParams: Promise.resolve({ source: "quiz" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("Jean Dupont");
    expect(json).toContain("Samir Belkacem");
    expect(json).not.toContain("Mina Chen");
  });

  it("filtre relance du jour (Africa/Algiers) garde les leads à suivre aujourd'hui", async () => {
    guardCtx.guard = { ok: true, auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" } };
    const el = await page({ params, searchParams: Promise.resolve({ follow_up: "1" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("Jean Dupont");
    expect(json).not.toContain("Mina Chen");
    expect(json).not.toContain("Samir Belkacem");
  });

  it("état vide ⇒ « Aucun lead »", async () => {
    guardCtx.guard = { ok: true, auth: { userId: "u-1", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" } };
    const el = await page({ params, searchParams: Promise.resolve({ status: "perdu" }) });
    const json = JSON.stringify(el);
    expect(json).toContain("t:empty");
    expect(json).not.toContain("Jean Dupont");
  });
});
