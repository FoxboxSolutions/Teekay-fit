import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";

/**
 * M7a bloc 2 — route POST /api/orders/[reference]/proof.
 * Supabase simulé ; RPC transition_payment espionnée. Cas :
 *  - 404 neutre : jeton absent/inconnu/expiré ;
 *  - 400 : référence de transaction invalide, type fichier invalide
 *    (magie), statut paiement non soumissible ;
 *  - 429 : rate limit IP ;
 *  - happy path : preuve insérée, transition verifying acteur system,
 *    réponse neutre identique avec ou sans drapeau doublon ;
 *  - doublon : needs_admin_review + audit SANS la référence client.
 */

const state = vi.hoisted(() => ({
  ipLimited: false,
  ordersRows: [] as Record<string, unknown>[],
  paymentRow: { id: "pay-1", status: "pending", amount_da: 2000 } as Record<string, unknown> | null,
  proofInsertId: "proof-abc",
  duplicateRows: [] as Record<string, unknown>[],
  auditInserts: [] as Record<string, unknown>[],
  orderUpdates: [] as Record<string, unknown>[],
  proofInserts: [] as Record<string, unknown>[],
  transitionCalls: [] as { args: Record<string, unknown> }[],
  uploadCalls: [] as { path: string; bytes: number }[],
}));

vi.mock("@/lib/supabase/admin", () => {
  function chainFor(
    table: string,
    settle: () => { data: unknown; error: unknown },
    onInsert?: (row: Record<string, unknown>) => void,
  ) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.neq = () => chain;
    chain.gt = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.single = () => Promise.resolve(settle());
    chain.maybeSingle = () => Promise.resolve(settle());
    chain.insert = (row: Record<string, unknown>) => {
      if (table === "payment_proofs") state.proofInserts.push(row);
      if (table === "audit_logs") state.auditInserts.push(row);
      onInsert?.(row);
      return chain;
    };
    chain.update = (row: Record<string, unknown>) => {
      if (table === "orders") state.orderUpdates.push(row);
      return chain;
    };
    chain.then = (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(settle()).then(onFulfilled, onRejected);
    return chain;
  }

  return {
    createSupabaseAdminClient: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "transition_payment") state.transitionCalls.push({ args });
        return Promise.resolve({ data: { result: "processed" }, error: null });
      },
      storage: {
        from: () => ({
          upload: async (path: string, body: Buffer) => {
            state.uploadCalls.push({ path, bytes: body.byteLength });
            return { error: null };
          },
        }),
      },
      from: (table: string) => {
        if (table === "orders") {
          return chainFor(table, () => ({ data: state.ordersRows, error: null }));
        }
        if (table === "payments") {
          return chainFor(table, () => ({
            data: state.paymentRow ? [state.paymentRow] : [],
            error: null,
          }));
        }
        if (table === "payment_proofs") {
          // Une requête avec .insert() resolve l'insertion ; une requête
          // simple (détection de doublon) renvoie les lignes doublons.
          let inserted = false;
          return chainFor(
            table,
            () =>
              inserted
                ? { data: [{ id: state.proofInsertId }], error: null }
                : { data: state.duplicateRows, error: null },
            () => {
              inserted = true;
            },
          );
        }
        return chainFor(table, () => ({ data: {}, error: null }));
      },
    }),
  };
});

vi.mock("@/lib/payments/status-token", () => ({
  hashStatusToken: (t: string) => `hash-${t.slice(0, 6)}`,
}));

vi.mock("@/lib/payments/proof", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/proof")>();
  return {
    ...actual,
    repackProofImage: async (buf: Buffer) => ({ webp: buf, bytes: buf.byteLength }),
    uploadProofImage: async (orderId: string, webp: Buffer) => {
      const path = `${orderId}/gen-uuid.webp`;
      state.uploadCalls.push({ path, bytes: webp.byteLength });
      return { objectPath: path, sizeBytes: webp.byteLength };
    },
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => !state.ipLimited,
  ipRateLimitKey: () => "ip-hash",
  clientIp: () => "203.0.113.42",
}));

let route: typeof import("@/app/api/orders/[reference]/proof/route");

beforeAll(async () => {
  process.env.APP_ENV = "development";
  process.env.PAYMENT_PROVIDER = "fake";
  route = await import("@/app/api/orders/[reference]/proof/route");
});

afterAll(() => {
  for (const k of ["APP_ENV", "PAYMENT_PROVIDER"] as const) delete process.env[k];
});

beforeEach(() => {
  state.ipLimited = false;
  state.ordersRows = [];
  state.paymentRow = { id: "pay-1", status: "pending", amount_da: 2000 };
  state.proofInsertId = "proof-abc";
  state.duplicateRows = [];
  state.auditInserts = [];
  state.orderUpdates = [];
  state.proofInserts = [];
  state.transitionCalls = [];
  state.uploadCalls = [];
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

function formDataRequest(
  fields: Record<string, string | Buffer | undefined>,
  reference = "TKF-2601-AB34",
): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (typeof v === "string") fd.set(k, v);
    else fd.set(k, new Blob([new Uint8Array(v)], { type: "image/png" }), "capture.jpg");
  }
  return new Request(`http://localhost/api/orders/${reference}/proof`, {
    method: "POST",
    body: fd,
  });
}

/** POST complet : requête + params Next 16 (Promise). */
function post(
  fields: Record<string, string | Buffer | undefined>,
  reference = "TKF-2601-AB34",
) {
  return route.POST(formDataRequest(fields, reference), {
    params: Promise.resolve({ reference }) as Promise<{ reference: string }>,
  });
}

describe("garde : jeton de statut (capacité) + réponses neutres", () => {
  it("jeton absent / trop court ⇒ 404 neutre, aucune écriture", async () => {
    for (const token of [undefined, "", "court"]) {
      const res = await post({ statusToken: token, txn: "7123456789" });
      expect(res.status).toBe(404);
    }
    expect(state.proofInserts).toHaveLength(0);
  });

  it("jeton inconnu ou expiré ⇒ 404 neutre (aucune différence observable)", async () => {
    state.ordersRows = [];
    const res = await post({ statusToken: "a".repeat(43), txn: "7123456789AB" });
    expect(res.status).toBe(404);
  });

  it("référence de transaction invalide ⇒ 400 reference_invalide", async () => {
    const res = await post({ statusToken: "a".repeat(43), txn: "boite@!" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("reference_invalide");
  });

  it("rate limit IP ⇒ 429 (fail closed)", async () => {
    state.ipLimited = true;
    const res = await post({ statusToken: "a".repeat(43), txn: "7123456789AB" });
    expect(res.status).toBe(429);
  });

  it("paiement non soumissible (déjà confirmé/refusé) ⇒ 400", async () => {
    state.ordersRows = [{ id: "o-1", status: "pending_payment", needs_admin_review: false }];
    state.paymentRow = { id: "pay-1", status: "confirmed", amount_da: 2000 };
    const res = await post({ statusToken: "a".repeat(43), txn: "7123456789AB" });
    expect(res.status).toBe(400);
  });
});

describe("soumission nominale + drapeau doublon", () => {
  it("preuve sans capture : insert (object_path null), transition verifying acteur system, 200 neutre", async () => {
    state.ordersRows = [{ id: "o-1", status: "pending_payment", needs_admin_review: false }];
    const res = await post({ statusToken: "a".repeat(43), txn: "7123456789AB" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string; duplicated: boolean };
    expect(body).toEqual({ ok: true, status: "verifying", duplicated: false });

    expect(state.proofInserts).toHaveLength(1);
    const row = state.proofInserts[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      payment_id: "pay-1",
      order_id: "o-1",
      txn_reference: "7123456789AB",
      object_path: null,
      mime_type: null,
      size_bytes: null,
    });
    expect(state.transitionCalls).toHaveLength(1);
    expect(state.transitionCalls[0]?.args).toMatchObject({
      p_payment_id: "pay-1",
      p_to_status: "verifying",
      p_actor_role: "system",
    });
  });

  it("capture png valide : magie acceptée, upload privé chemin regénéré, mime webp", async () => {
    state.ordersRows = [{ id: "o-1", status: "pending_payment", needs_admin_review: false }];
    const res = await post({
      statusToken: "a".repeat(43),
      txn: "7123456789AB",
      capture: PNG_MAGIC,
    });
    expect(res.status).toBe(200);
    const row = state.proofInserts[0] as Record<string, unknown>;
    expect(row.object_path).toBe("o-1/gen-uuid.webp");
    expect(row.mime_type).toBe("image/webp");
    expect(state.uploadCalls).toHaveLength(1);
  });

  it("fichier non-image (faux .jpg) ⇒ 400 type_invalide, aucune insertion ni upload", async () => {
    state.ordersRows = [{ id: "o-1", status: "pending_payment", needs_admin_review: false }];
    const res = await post({
      statusToken: "a".repeat(43),
      txn: "7123456789AB",
      capture: Buffer.from("ce-n-est-pas-une-image"),
    });
    expect(res.status).toBe(400);
    expect(state.proofInserts).toHaveLength(0);
    expect(state.uploadCalls).toHaveLength(0);
    expect(state.transitionCalls).toHaveLength(0);
  });

  it("même référence de transaction sur une autre commande ⇒ needs_admin_review + audit sans la référence ; réponse client identique", async () => {
    state.ordersRows = [{ id: "o-1", status: "pending_payment", needs_admin_review: false }];
    state.duplicateRows = [{ id: "proof-other", order_id: "o-other" }];
    const res = await post({ statusToken: "a".repeat(43), txn: "7123456789AB" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { duplicated: boolean; status: string };
    expect(body).toEqual({ ok: true, status: "verifying", duplicated: true });

    expect(state.orderUpdates).toEqual([{ needs_admin_review: true }]);
    expect(state.auditInserts).toHaveLength(1);
    const audit = state.auditInserts[0] as Record<string, unknown>;
    expect(audit.action).toBe("proof_duplicate_txn_ref");
    expect(JSON.stringify(audit)).not.toContain("7123456789AB");
  });
});
