import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * M9a point (c) — route de REVUE D'IDENTITÉ d'un lead `needs_review`
 * (POST /api/admin/leads/[id]/review) : une exigence = un test nommé.
 *
 *  (a) garde requireAdminAal2 : 401 sans session, 403 not_admin,
 *      403 mfa_required — et AUCUNE lecture ni écriture dans ces cas ;
 *  (b) entrée zod STRICTE : décision (enum) + motif, RIEN d'autre
 *      (champ en plus ⇒ 400, décision inconnue ⇒ 400, motif absent ou
 *      trop court ⇒ 400, corps non JSON ⇒ 400) ;
 *  (c) rate limit IP (même filet que les écritures lead) : 429 ;
 *  (d) 404 lead inconnu ; 409 déjà revu (needs_review = false) ;
 *      400 use_submitted sans nom soumis ;
 *  (e) chaque décision appliquée :
 *        keep_existing  ⇒ { needs_review: false } (nom inchangé) ;
 *        use_submitted  ⇒ { needs_review: false, name: nom soumis } ;
 *        note_and_close ⇒ notes EXISTANTES conservées + ligne « autre nom
 *          soumis » ajoutée en fin (jamais d'écrasement), needs_review false ;
 *  (f) TOUTE décision audité avec motif : action `lead_identity_reviewed`,
 *      metadata = lead_id, decision, reason, submitted_name — JAMAIS le
 *      contenu des notes ;
 *  (g) échec d'écriture ⇒ 500 neutre, aucun audit.
 */
const fake = vi.hoisted(() => ({
  guard: null as Record<string, unknown> | null,
  rateOk: true,
  rateCalls: [] as { bucket: string; limit: number; window: number }[],
  leadRow: null as Record<string, unknown> | null,
  leadError: null as { message: string } | null,
  leadQueried: 0,
  updates: [] as Record<string, unknown>[],
  updateError: null as { message: string } | null,
  auditInserts: [] as Record<string, unknown>[],
  auditError: null as { message: string } | null,
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () => fake.guard,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => {
        if (table === "leads") fake.leadQueried += 1;
        return chain;
      };
      chain.eq = () => chain;
      chain.single = async () => ({ data: fake.leadRow, error: fake.leadError });
      chain.update = (payload: Record<string, unknown>) => {
        fake.updates.push({ table, payload });
        return {
          eq: async () => ({ data: null, error: fake.updateError }),
        };
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === "audit_logs") fake.auditInserts.push(row);
        return Promise.resolve({ data: null, error: fake.auditError });
      },
    }),
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async (bucket: string, limit: number, window: number) => {
    fake.rateCalls.push({ bucket, limit, window });
    return fake.rateOk;
  },
  ipRateLimitKey: (headers: Headers, prefix: string) => `${prefix}:ip`,
}));

type RouteModule = typeof import("@/app/api/admin/leads/[id]/review/route");
let post: RouteModule["POST"];

const LEAD = "33333333-4444-4555-8666-777777777777";
const ADMIN = "admin-uid-1";

const guardOk = {
  ok: true,
  auth: { userId: ADMIN, isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
};

const leadBase = {
  id: LEAD,
  name: "Karim B.",
  submitted_name: "Karim B. (famille)",
  needs_review: true,
  notes: "Note du coach existante.",
};

function jsonRequest(body: unknown): Request {
  return new Request(`http://localhost/api/admin/leads/${LEAD}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeAll(async () => {
  ({ POST: post } = await import("@/app/api/admin/leads/[id]/review/route"));
});

beforeEach(() => {
  fake.guard = guardOk;
  fake.rateOk = true;
  fake.rateCalls = [];
  fake.leadRow = { ...leadBase };
  fake.leadError = null;
  fake.leadQueried = 0;
  fake.updates = [];
  fake.updateError = null;
  fake.auditInserts = [];
  fake.auditError = null;
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("garde requireAdminAal2 (aucune donnée touchée sans admin + aal2)", () => {
  it("sans session ⇒ 401, aucune lecture ni écriture ni audit", async () => {
    fake.guard = { ok: false, status: 401, error: "unauthenticated" };
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "test" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(401);
    expect((await readJson(res)).error).toBe("unauthenticated");
    expect(fake.leadQueried).toBe(0);
    expect(fake.updates).toHaveLength(0);
    expect(fake.auditInserts).toHaveLength(0);
  });

  it("connecté non admin ⇒ 403 not_admin, aucune lecture ni écriture", async () => {
    fake.guard = { ok: false, status: 403, error: "not_admin" };
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "test" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toBe("not_admin");
    expect(fake.leadQueried).toBe(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("admin aal1 (sans second facteur) ⇒ 403 mfa_required, aucune écriture", async () => {
    fake.guard = { ok: false, status: 403, error: "mfa_required" };
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "test" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toBe("mfa_required");
    expect(fake.updates).toHaveLength(0);
  });
});

describe("entrée zod STRICTE", () => {
  it("champ en plus ⇒ 400 invalid_input (aucune lecture)", async () => {
    const res = await post(
      jsonRequest({ decision: "keep_existing", reason: "test motif", extra: 1 }),
      { params: Promise.resolve({ id: LEAD }) },
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe("invalid_input");
    expect(fake.leadQueried).toBe(0);
  });

  it("décision inconnue ⇒ 400 ; motif absent ou trop court ⇒ 400 ; corps non JSON ⇒ 400", async () => {
    for (const body of [
      { decision: "fusion_auto", reason: "test motif" },
      { decision: "keep_existing" },
      { decision: "keep_existing", reason: "ab" },
      "pas-du-json",
    ]) {
      const res = await post(jsonRequest(body), {
        params: Promise.resolve({ id: LEAD }),
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await readJson(res)).error).toBe("invalid_input");
    }
    expect(fake.updates).toHaveLength(0);
  });
});

describe("rate limit", () => {
  it("filet dépassé ⇒ 429 + Retry-After, aucune écriture", async () => {
    fake.rateOk = false;
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "test motif" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect(fake.updates).toHaveLength(0);
    expect(fake.auditInserts).toHaveLength(0);
  });
});

describe("cas refusés après garde", () => {
  it("lead inconnu ⇒ 404 not_found", async () => {
    fake.leadRow = null;
    fake.leadError = { message: "no rows" };
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "test motif" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(404);
    expect((await readJson(res)).error).toBe("not_found");
  });

  it("lead déjà revu ⇒ 409 already_reviewed, aucune écriture", async () => {
    fake.leadRow = { ...leadBase, needs_review: false };
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "test motif" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(409);
    expect((await readJson(res)).error).toBe("already_reviewed");
    expect(fake.updates).toHaveLength(0);
  });

  it("use_submitted sans nom soumis ⇒ 400 no_submitted_name", async () => {
    fake.leadRow = { ...leadBase, submitted_name: null };
    const res = await post(jsonRequest({ decision: "use_submitted", reason: "test motif" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe("no_submitted_name");
    expect(fake.updates).toHaveLength(0);
  });
});

describe("chaque décision est appliquée et auditée avec motif", () => {
  it("keep_existing ⇒ nom inchangé, needs_review false, audit décision + motif", async () => {
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "même personne" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ ok: true });
    expect(fake.updates).toEqual([
      { table: "leads", payload: { needs_review: false } },
    ]);
    expect(fake.auditInserts).toHaveLength(1);
    expect(fake.auditInserts[0]).toMatchObject({
      actor_id: ADMIN,
      actor_role: "admin",
      action: "lead_identity_reviewed",
      entity_type: "lead",
      entity_id: LEAD,
      metadata: {
        lead_id: LEAD,
        decision: "keep_existing",
        reason: "même personne",
        submitted_name: "Karim B. (famille)",
      },
    });
  });

  it("use_submitted ⇒ name remplacé par le nom soumis, needs_review false, auditée", async () => {
    const res = await post(jsonRequest({ decision: "use_submitted", reason: "orthographe corrigée par le client" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(200);
    expect(fake.updates).toEqual([
      { table: "leads", payload: { needs_review: false, name: "Karim B. (famille)" } },
    ]);
    expect(fake.auditInserts[0]).toMatchObject({
      action: "lead_identity_reviewed",
      metadata: { decision: "use_submitted", reason: "orthographe corrigée par le client" },
    });
  });

  it("note_and_close ⇒ notes existantes PRÉSERVÉES + autre nom ajouté en fin, jamais écrasées ; l'audit ne contient JAMAIS les notes", async () => {
    const res = await post(jsonRequest({ decision: "note_and_close", reason: "numéro familial partagé" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(200);
    expect(fake.updates).toHaveLength(1);
    const payload = fake.updates[0]!.payload as { needs_review: boolean; notes: string };
    expect(payload.needs_review).toBe(false);
    expect(payload.notes).toBe(
      "Note du coach existante.\n[Revue identité] autre nom soumis : Karim B. (famille)",
    );
    // L'audit trace décision + motif, pas le contenu des notes.
    expect(JSON.stringify(fake.auditInserts[0])).not.toContain("Note du coach existante");
    expect(fake.auditInserts[0]).toMatchObject({
      action: "lead_identity_reviewed",
      metadata: { decision: "note_and_close", reason: "numéro familial partagé" },
    });
  });

  it("note_and_close sans notes existantes ⇒ notes créées avec la ligne seule", async () => {
    fake.leadRow = { ...leadBase, notes: null };
    const res = await post(jsonRequest({ decision: "note_and_close", reason: "sans notes" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(200);
    const payload = fake.updates[0]!.payload as { notes: string };
    expect(payload.notes).toBe("[Revue identité] autre nom soumis : Karim B. (famille)");
  });
});

describe("échecs d'écriture", () => {
  it("échec de mise à jour ⇒ 500 neutre, AUCUN audit", async () => {
    fake.updateError = { message: "boom" };
    const res = await post(jsonRequest({ decision: "keep_existing", reason: "test motif" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(500);
    expect((await readJson(res)).error).toBe("update_failed");
    expect(fake.auditInserts).toHaveLength(0);
  });
});
