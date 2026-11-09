import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";

/**
 * M9a — POST /api/admin/outbox/[id]/resend : renvoi idempotent d'un e-mail en
 * echec (outbox), garde aal2, filet IP 20/600, audit email_resend.
 */
const guardCtx = vi.hoisted(() => ({ guard: null as null | Record<string, unknown> }));
const rlCtx = vi.hoisted(() => ({ calls: 0 }));

const baseOutbox = [
  { id: "e-1", payment_id: "p-1", event_type: "payment_confirmed", status: "failed", attempts: 3, last_error: "smtp timeout", created_at: "2026-11-09T10:00:00Z" },
  { id: "e-2", payment_id: "p-2", event_type: "payment_confirmed", status: "queued", attempts: 0, last_error: null, created_at: "2026-11-09T10:05:00Z" },
];

let dbRows = { email_outbox: [...baseOutbox] };

const auditInserts: Record<string, unknown>[] = [];

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () => guardCtx.guard,
}));

function makeAdminClient() {
  return {
    from: () => {
      const row = dbRows.email_outbox[0]!;
      const chain = {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          auditInserts.push(row);
          return Promise.resolve({ data: null, error: null });
        },
        update: (patch: Record<string, unknown>) => {
          // Simule une mise à jour : trouve la ligne et la modifie
          const idx = dbRows.email_outbox.findIndex((r) => r.id === patch.id || r.id === "e-1");
          if (idx >= 0) {
            Object.assign(dbRows.email_outbox[idx]!, patch);
          }
          return {
            eq: () => Promise.resolve({ data: null, error: null }),
          };
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: makeAdminClient,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => { rlCtx.calls += 1; return rlCtx.calls <= 20; },
  ipRateLimitKey: () => "outbox_resend_ip",
}));

type RouteModule = typeof import("@/app/api/admin/outbox/[id]/resend/route");
let resendRoute: RouteModule["POST"];

const params = Promise.resolve({ id: "e-1" }) as Promise<{ id: string }>;

beforeAll(async () => {
  ({ POST: resendRoute } = await import("@/app/api/admin/outbox/[id]/resend/route"));
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
  auditInserts.length = 0;
  dbRows = { email_outbox: [...baseOutbox] };
});

function resendRequest(): Request {
  return new Request("http://localhost/api/admin/outbox/e-1/resend", { method: "POST" });
}

describe("POST /api/admin/outbox/[id]/resend", () => {
  it("echec => remis en file d'attente (queued) et audite", async () => {
    const res = await resendRoute(resendRequest(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "queued" });
    const audit = auditInserts[0];
    expect(audit).toMatchObject({
      action: "email_resend",
      entity_type: "email_outbox",
      entity_id: "e-1",
      actor_id: "u-admin",
      actor_role: "admin",
    });
    expect((audit as Record<string, unknown>).metadata).toMatchObject({
      outbox_id: "e-1",
      payment_id: "p-1",
      event_type: "payment_confirmed",
    });
    expect(dbRows.email_outbox[0]!.status).toBe("queued");
  });

  it("deja en attente => reponse neutre idempotente, aucun audit", async () => {
    const res = await resendRoute(resendRequest(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "queued", idempotent: true });
    expect(auditInserts).toHaveLength(0);
  });

  it("outbox inconnue => 404", async () => {
    dbRows.email_outbox = [];
    const res = await resendRoute(resendRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("garde aal2 : sans session => 401", async () => {
    guardCtx.guard = { ok: false, status: 401, error: "unauthenticated" };
    const res = await resendRoute(resendRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("filet IP 20/600 : 20 passent, la 21e => 429 + Retry-After 600", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await resendRoute(resendRequest(), { params });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    const last = await resendRoute(resendRequest(), { params });
    expect(last.headers.get("Retry-After")).toBe("600");
  });
});
