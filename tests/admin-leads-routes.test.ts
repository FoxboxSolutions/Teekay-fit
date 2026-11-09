import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";

/**
 * M9a — routes d'écriture leads (/api/admin/leads/[id]/{status,convert,notes}) :
 * garde aal2, filet IP 20/600, validation zod, audit_logs, conversion sans
 * doublon (même téléphone normalisé ⇒ 409, revue humaine).
 */
const guardCtx = vi.hoisted(() => ({ guard: null as null | Record<string, unknown> }));
const rlCtx = vi.hoisted(() => ({ calls: 0, allow: true }));

const leadRow = (overrides: Record<string, unknown> = {}) => ({
  id: "l-1",
  name: "Jean Dupont",
  phone: "+213 6 00 00 00 01",
  phone_norm: "+213600000001",
  email: "jean@example.com",
  status: "new",
  next_follow_up_at: null,
  notes: null,
  ...overrides,
});

const dbRows = { leads: [leadRow()], customers: [] } as { leads: unknown[]; customers: unknown[] };

function makeDb() {
  return {
    from: (table: string) => {
      const rows: unknown[] = ((dbRows as Record<string, unknown[]>)[table] ?? []) as unknown[];
      let singleMode = false;
      let updatePatch: Record<string, unknown> | null = null;
      let insertRow: Record<string, unknown> | null = null;
      const mods: Array<{ col: string; op: string; val: unknown }> = [];
      const apply = () => {
        let out = rows;
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
            return true;
          });
        }
        if (updatePatch) {
          rows.forEach((row) => {
            const r = row as Record<string, unknown>;
            const matches = mods.every((m) => {
              const cell = r[m.col];
              if (m.op === "eq") return cell === m.val;
              return true;
            });
            if (matches) Object.assign(r, updatePatch);
          });
          out = out.map((row) => ({ ...(row as Record<string, unknown>) }));
          updatePatch = null;
        }
        if (insertRow) {
          rows.push(insertRow);
          out = [insertRow];
          insertRow = null;
        }
        if (singleMode) return out.length ? { ...(out[0] as Record<string, unknown>) } : null;
        return out;
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
        update: (patch: Record<string, unknown>) => { updatePatch = patch; return chain; },
        insert: (row: Record<string, unknown>) => { insertRow = { ...row, id: row.id ?? "c-1" }; return chain; },
        then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: apply(), error: null }).then(onFulfilled),
      };
      return chain;
    },
  };
}

const auditInserts: Record<string, unknown>[] = [];

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () => guardCtx.guard,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => makeDb(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => { auditInserts.push(row); return Promise.resolve({ data: null, error: null }); },
    }),
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => { rlCtx.calls += 1; return rlCtx.calls <= 20; },
  ipRateLimitKey: () => "rate_bucket",
}));

type StatusModule = typeof import("@/app/api/admin/leads/[id]/status/route");
type ConvertModule = typeof import("@/app/api/admin/leads/[id]/convert/route");
type NotesModule = typeof import("@/app/api/admin/leads/[id]/notes/route");

let statusRoute: StatusModule["POST"];
let convertRoute: ConvertModule["POST"];
let notesRoute: NotesModule["POST"];

const params = Promise.resolve({ id: "l-1" }) as Promise<{ id: string }>;

beforeAll(async () => {
  ({ POST: statusRoute } = await import("@/app/api/admin/leads/[id]/status/route"));
  ({ POST: convertRoute } = await import("@/app/api/admin/leads/[id]/convert/route"));
  ({ POST: notesRoute } = await import("@/app/api/admin/leads/[id]/notes/route"));
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  guardCtx.guard = {
    ok: true,
    auth: { userId: "u-admin", isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
  };
  rlCtx.calls = 0;
  rlCtx.allow = true;
  auditInserts.length = 0;
  dbRows.leads = [leadRow()];
  dbRows.customers = [];
});

function statusRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/leads/l-1/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/leads/[id]/status", () => {
  it("passe le statut new -> contacted et audite la transition", async () => {
    const res = await statusRoute(statusRequest({ status: "contacted" }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(auditInserts[0]).toMatchObject({
      action: "lead_status_changed",
      entity_type: "lead",
      entity_id: "l-1",
      actor_id: "u-admin",
      actor_role: "admin",
    });
    expect((auditInserts[0] as Record<string, unknown>).metadata).toMatchObject({
      from: "new",
      to: "contacted",
      lead_id: "l-1",
    });
  });

  it("statut déjà égal : 200 sans double audit", async () => {
    const res = await statusRoute(statusRequest({ status: "new" }), { params });
    expect(res.status).toBe(200);
    expect(auditInserts).toHaveLength(0);
  });

  it("lead inconnu ⇒ 404", async () => {
    dbRows.leads = [];
    const res = await statusRoute(statusRequest({ status: "contacted" }), { params });
    expect(res.status).toBe(404);
  });

  it("statut invalide ⇒ 400", async () => {
    const res = await statusRoute(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ status: "bidon" }) }), { params });
    expect(res.status).toBe(400);
  });

  it("garde aal2 : sans session 401, pas admin 403", async () => {
    guardCtx.guard = { ok: false, status: 401, error: "unauthenticated" };
    let res = await statusRoute(statusRequest({ status: "contacted" }), { params });
    expect(res.status).toBe(401);
    guardCtx.guard = { ok: false, status: 403, error: "not_admin" };
    res = await statusRoute(statusRequest({ status: "contacted" }), { params });
    expect(res.status).toBe(403);
  });

  it("filet IP 20/600 : 20 requêtes passent, la 21e ⇒ 429 + Retry-After 600", async () => {
    dbRows.leads = [leadRow({ status: "new" })];
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await statusRoute(statusRequest({ status: "new" }), { params });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    const last = await statusRoute(statusRequest({ status: "new" }), { params });
    expect(last.headers.get("Retry-After")).toBe("600");
  });
});

describe("POST /api/admin/leads/[id]/convert", () => {
  it("convertit un lead en client (aucun client existant au même numéro)", async () => {
    const res = await convertRoute(statusRequest({}), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, customerId: "c-1" });
    expect(auditInserts[0]).toMatchObject({ action: "lead_converted", entity_id: "l-1" });
  });

  it("refuse la conversion si un client porte déjà le même téléphone (409, audit, pas de fusion)", async () => {
    dbRows.customers = [{ id: "c-exist", phone_norm: "+213600000001" }];
    const res = await convertRoute(statusRequest({}), { params });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "duplicate_customer" });
    const audit = auditInserts.find((a) => (a as Record<string, unknown>).action === "lead_conversion_blocked_duplicate");
    expect(audit).toBeTruthy();
    expect(dbRows.leads[0]).toMatchObject({ status: "new" }); // pas de conversion
  });

  it("lead déjà converti ⇒ 409 (idempotent)", async () => {
    dbRows.leads = [leadRow({ status: "converted" })];
    const res = await convertRoute(statusRequest({}), { params });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "already_converted" });
  });

  it("lead inconnu ⇒ 404", async () => {
    dbRows.leads = [];
    const res = await convertRoute(statusRequest({}), { params });
    expect(res.status).toBe(404);
  });

  it("garde aal2 : sans session ⇒ 401", async () => {
    guardCtx.guard = { ok: false, status: 401, error: "unauthenticated" };
    const res = await convertRoute(statusRequest({}), { params });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/leads/[id]/notes", () => {
  it("met à jour les notes et audite l'action (sans le contenu dans le journal)", async () => {
    const res = await notesRoute(
      new Request("http://localhost/api/admin/leads/l-1/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Relancer jeudi prochain" }),
      }),
      { params },
    );
    expect(res.status).toBe(200);
    expect((dbRows.leads[0] as Record<string, unknown>).notes).toBe("Relancer jeudi prochain");
    const audit = auditInserts[0];
    expect(audit).toMatchObject({ action: "lead_notes_updated", entity_id: "l-1", actor_id: "u-admin" });
    // le contenu des notes n'est pas dupliqué dans le journal
    expect(JSON.stringify(audit)).not.toContain("Relancer jeudi");
  });

  it("notes trop longues ⇒ 400", async () => {
    const res = await notesRoute(
      new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ notes: "x".repeat(4001) }) }),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("garde aal2 : session expirée ⇒ 403 session_expired", async () => {
    guardCtx.guard = { ok: false, status: 403, error: "session_expired" };
    const res = await notesRoute(
      new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ notes: "x" }) }),
      { params },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "session_expired" });
  });
});
