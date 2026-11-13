import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * M9a point (f) — route de CONSULTATION EXPLICITE des réponses PAR-Q
 * (POST /api/admin/par-q) : une exigence = un test nommé.
 *
 *  (a) garde requireAdminAal2 : 401 sans session, 403 not_admin,
 *      403 mfa_required — et AUCUN audit ni lecture dans ces cas ;
 *  (b) entrée zod STRICTE : l'identifiant de commande, RIEN d'autre
 *      (champ en plus ⇒ 400, uuid invalide ⇒ 400, corps non JSON ⇒ 400) ;
 *  (c) rate limit compteur Postgres : 429 + Retry-After, clé par admin
 *      `parq_read_user`, borne 20/600 s (défaut) ;
 *  (d) ordre AUDIT-AVANT-LECTURE : échec d'audit ⇒ 500 neutre et AUCUNE
 *      lecture de `aptitude_questionnaires` (établi par compteur) ;
 *  (e) lecture seulement si l'audit a réussi — échec de lecture après audit
 *      réussi ⇒ 500 neutre, aucune réponse renvoyée ;
 *  (f) réponse limitée à la SEULE commande demandée : 7 booléens q1..q7,
 *      rien d'autre ; commande sans questionnaire ⇒ 404 not_found ;
 *  + l'entrée d'audit ne contient AUCUNE réponse (metadata = order_id seul) ;
 *  + les journaux (console.error) ne contiennent jamais de réponse ;
 *  + la borne du filet est bornée (ADMIN_PARQ_READ_LIMIT saturée 1–120).
 */
const fake = vi.hoisted(() => ({
  guard: null as Record<string, unknown> | null,
  rateOk: true,
  rateCalls: [] as { bucket: string; limit: number; window: number }[],
  rateKeyCalls: [] as { userId: string; prefix: string }[],
  auditError: null as { message: string } | null,
  auditInserts: [] as Record<string, unknown>[],
  parqRows: [] as Record<string, unknown>[],
  parqError: null as { message: string } | null,
  parqQueried: 0,
  parqSelects: [] as string[],
  parqEq: [] as { col: string; val: unknown }[],
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () => fake.guard,
}));

vi.mock("@/lib/supabase/admin", () => {
  function tableChain(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = (cols: string) => {
      if (table === "aptitude_questionnaires") {
        fake.parqQueried += 1;
        fake.parqSelects.push(String(cols));
      }
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      fake.parqEq.push({ col, val });
      return chain;
    };
    chain.limit = () => chain;
    chain.insert = (row: Record<string, unknown>) => {
      if (table === "audit_logs") fake.auditInserts.push(row);
      return {
        then: (
          onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        ) => Promise.resolve({ data: null, error: fake.auditError }).then(onFulfilled),
      };
    };
    chain.then = (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: fake.parqRows, error: fake.parqError }).then(onFulfilled, onRejected);
    return chain;
  }

  return {
    createSupabaseAdminClient: () => ({
      from: (table: string) => tableChain(table),
    }),
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async (bucket: string, limit: number, window: number) => {
    fake.rateCalls.push({ bucket, limit, window });
    return fake.rateOk;
  },
  userRateLimitKey: (userId: string, prefix: string) => {
    fake.rateKeyCalls.push({ userId, prefix });
    return `${prefix}:${userId}`;
  },
}));

type RouteModule = typeof import("@/app/api/admin/par-q/route");
let post: RouteModule["POST"];

const ORDER = "22222222-3333-4444-8555-666666666666";
const ADMIN = "admin-uid-1";

const guardOk = {
  ok: true,
  auth: { userId: ADMIN, isAdmin: true, hasMfa: true, aal2: true, sessionId: "s-1" },
};

const COLS = [
  "q1_heart_condition",
  "q2_exertion_chest_pain",
  "q3_rest_chest_pain",
  "q4_syncope",
  "q5_joint_bone_problem",
  "q6_heart_medication",
  "q7_other_restriction",
];

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/par-q", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Réponse JSON typée minimaliste (NextResponse est sérialisable). */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeAll(async () => {
  const mod = await import("@/app/api/admin/par-q/route");
  post = mod.POST;
});

beforeEach(() => {
  fake.guard = guardOk;
  fake.rateOk = true;
  fake.rateCalls = [];
  fake.rateKeyCalls = [];
  fake.auditError = null;
  fake.auditInserts = [];
  fake.parqRows = [];
  fake.parqError = null;
  fake.parqQueried = 0;
  fake.parqSelects = [];
  fake.parqEq = [];
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("M9a (f) — route /api/admin/par-q (consultation explicite, audité)", () => {
  it("TEST NOMMÉ (a) : garde requireAdminAal2 — 401 sans session, 403 not_admin, 403 mfa_required, et AUCUN audit ni lecture dans ces cas", async () => {
    for (const [guard, status, error] of [
      [{ ok: false, status: 401, error: "unauthenticated" }, 401, "unauthenticated"],
      [{ ok: false, status: 403, error: "not_admin" }, 403, "not_admin"],
      [{ ok: false, status: 403, error: "mfa_required" }, 403, "mfa_required"],
    ] as [Record<string, unknown>, number, string][]) {
      fake.guard = guard;
      const res = await post(jsonRequest({ orderId: ORDER }));
      expect(res.status, `statut pour ${error}`).toBe(status);
      expect((await readJson(res)).error, `erreur pour ${error}`).toBe(error);
      expect(fake.auditInserts, `${error} : aucun audit`).toEqual([]);
      expect(fake.parqQueried, `${error} : aucune lecture`).toBe(0);
      expect(fake.rateCalls, `${error} : aucun rate limit`).toEqual([]);
    }
  });

  it("TEST NOMMÉ (b) : entrée zod STRICTE — orderId seul (champ en plus, uuid invalide, corps non JSON ⇒ 400) ; rien d'audité ni lu", async () => {
    for (const body of [
      { orderId: ORDER, extra: "pirate" }, // champ en plus refusé (strictObject)
      { orderId: "pas-un-uuid" },
      { orderIds: [ORDER] },
      "corps-non-json",
    ]) {
      const res = await post(jsonRequest(body));
      expect(res.status, `400 pour ${JSON.stringify(body)}`).toBe(400);
      expect((await readJson(res)).error).toBe("invalid_input");
    }
    // Corps illisible (JSON cassé).
    const broken = await post(jsonRequest("{orderId:"));
    expect(broken.status).toBe(400);
    expect((await readJson(broken)).error).toBe("invalid_input");

    expect(fake.auditInserts, "aucun audit sur entrée invalide").toEqual([]);
    expect(fake.parqQueried, "aucune lecture sur entrée invalide").toBe(0);
  });

  it("TEST NOMMÉ (c) : rate limit compteur Postgres — 429 + Retry-After 600, clé par admin `parq_read_user`, défaut 20 / 600 s", async () => {
    fake.rateOk = false;
    const res = await post(jsonRequest({ orderId: ORDER }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect((await readJson(res)).error).toBe("rate_limited");
    // La clé dérive de l'uid admin (préfixe parq_read_user) — jamais l'IP.
    expect(fake.rateKeyCalls).toEqual([{ userId: ADMIN, prefix: "parq_read_user" }]);
    expect(fake.rateCalls[0]?.bucket.startsWith("parq_read_user:")).toBe(true);
    expect(fake.rateCalls[0]?.limit).toBe(20); // filet par défaut
    expect(fake.rateCalls[0]?.window).toBe(600);
    // Le refus ne consomme ni audit ni lecture.
    expect(fake.auditInserts).toEqual([]);
    expect(fake.parqQueried).toBe(0);
  });

  it("TEST NOMMÉ (c-bis) : la borne du filet est bornée — ADMIN_PARQ_READ_LIMIT saturé dans [1, 120]", async () => {
    const prev = process.env.ADMIN_PARQ_READ_LIMIT;
    try {
      process.env.ADMIN_PARQ_READ_LIMIT = "5000";
      await post(jsonRequest({ orderId: ORDER }));
      expect(fake.rateCalls.at(-1)?.limit).toBe(120);
      process.env.ADMIN_PARQ_READ_LIMIT = "0";
      await post(jsonRequest({ orderId: ORDER }));
      expect(fake.rateCalls.at(-1)?.limit).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_PARQ_READ_LIMIT;
      else process.env.ADMIN_PARQ_READ_LIMIT = prev;
    }
  });

  it("TEST NOMMÉ (d) : ordre AUDIT-AVANT-LECTURE — échec d'écriture d'audit ⇒ 500 neutre et AUCUNE lecture de aptitude_questionnaires", async () => {
    fake.auditError = { message: "append-only indisponible (simulation)" };
    const res = await post(jsonRequest({ orderId: ORDER }));
    expect(res.status).toBe(500);
    expect((await readJson(res)).error).toBe("indisponible");
    // Prouvé par compteur : la requête SELECT n'a JAMAIS été construite.
    expect(fake.auditInserts.length, "l'audit a bien été tenté").toBe(1);
    expect(fake.parqQueried, "aucune lecture des réponses").toBe(0);
  });

  it("TEST NOMMÉ (e) : lecture seulement si l'audit a réussi — échec de lecture après audit réussi ⇒ 500 neutre, aucune réponse renvoyée", async () => {
    fake.parqError = { message: "lecture impossible (simulation)" };
    const res = await post(jsonRequest({ orderId: ORDER }));
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error).toBe("indisponible");
    expect(body.answers).toBeUndefined();
    expect(fake.parqQueried).toBe(1); // l'audit avait réussi, la lecture a été tentée
  });

  it("TEST NOMMÉ (f) : réponse limitée à la SEULE commande demandée — 7 booléens q1..q7, rien d'autre ; colonnes lues = exactement les 7 colonnes PAR-Q", async () => {
    fake.parqRows = [
      {
        q1_heart_condition: true,
        q2_exertion_chest_pain: false,
        q3_rest_chest_pain: true,
        q4_syncope: false,
        q5_joint_bone_problem: true,
        q6_heart_medication: false,
        q7_other_restriction: false,
      },
    ];
    const res = await post(jsonRequest({ orderId: ORDER }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.orderId).toBe(ORDER);
    expect(body.answers).toEqual({
      q1: true,
      q2: false,
      q3: true,
      q4: false,
      q5: true,
      q6: false,
      q7: false,
    });
    // La réponse ne contient RIEN d'autre que orderId + answers.
    expect(Object.keys(body).sort()).toEqual(["answers", "orderId"]);
    // La lecture cible la seule commande demandée (.eq order_id) et lit
    // exactement les 7 colonnes structurées (jamais select *).
    expect(fake.parqSelects).toEqual([COLS.join(",")]);
    expect(fake.parqEq).toEqual([{ col: "order_id", val: ORDER }]);
  });

  it("TEST NOMMÉ (f-bis) : commande sans questionnaire PAR-Q ⇒ 404 not_found (audit tout de même écrit)", async () => {
    fake.parqRows = [];
    const res = await post(jsonRequest({ orderId: ORDER }));
    expect(res.status).toBe(404);
    expect((await readJson(res)).error).toBe("not_found");
    expect(fake.auditInserts.length).toBe(1);
  });

  it("TEST NOMMÉ (f-audit) : l'entrée d'audit ne contient AUCUNE réponse — action parq_answers_read, metadata = { order_id } uniquement", async () => {
    fake.parqRows = [
      {
        q1_heart_condition: true,
        q2_exertion_chest_pain: true,
        q3_rest_chest_pain: true,
        q4_syncope: true,
        q5_joint_bone_problem: true,
        q6_heart_medication: true,
        q7_other_restriction: true,
      },
    ];
    await post(jsonRequest({ orderId: ORDER }));
    expect(fake.auditInserts.length).toBe(1);
    const row = fake.auditInserts[0]!;
    expect(row.action).toBe("parq_answers_read");
    expect(row.entity_type).toBe("order");
    expect(row.entity_id).toBe(ORDER);
    expect(row.actor_id).toBe(ADMIN);
    expect(row.actor_role).toBe("admin");
    // metadata : l'identifiant de commande et RIEN d'autre — jamais un q1..q7.
    expect(row.metadata).toEqual({ order_id: ORDER });
    const serialized = JSON.stringify(row);
    for (const col of COLS) expect(serialized.includes(col)).toBe(false);
  });

  it("TEST NOMMÉ (f-journaux) : aucune réponse dans les journaux — console.error ne contient jamais q1..q7 ni la valeur answers", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
    try {
      // 1) échec d'audit : la seule ligne loggée porte l'ERREUR, pas de réponse.
      fake.auditError = { message: "audit indisponible (simulation)" };
      await post(jsonRequest({ orderId: ORDER }));
      // 2) échec de lecture : idem.
      fake.auditError = null;
      fake.parqError = { message: "lecture impossible (simulation)" };
      fake.parqRows = [Object.fromEntries(COLS.map((c) => [c, true]))];
      await post(jsonRequest({ orderId: ORDER }));
      // 3) succès : AUCUNE ligne de journal du tout.
      fake.parqError = null;
      const ok = await post(jsonRequest({ orderId: ORDER }));
      expect(ok.status).toBe(200);
      // Aucun journal ne contient de colonne de réponse ni le bloc answers.
      expect(logged.length).toBe(2);
      for (const line of logged) {
        const entry = JSON.parse(line) as Record<string, unknown>;
        expect(Object.keys(entry).sort()).toEqual(["error", "event", "level"]);
        for (const col of COLS) expect(line.includes(col)).toBe(false);
        expect(line.includes("answers")).toBe(false);
      }
    } finally {
      spy.mockRestore();
    }
  });
});
