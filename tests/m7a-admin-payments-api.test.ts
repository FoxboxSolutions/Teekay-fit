import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";

/**
 * M7a bloc 4 — routes admin paiements (liste / confirmer / rejeter) :
 *  - garde aal2 sur GET + POST (SANS aal2 ⇒ 403, même admin) ;
 *  - confirmation : montant différent ⇒ 400 montant_invalide, AUCUNE
 *    transition ; montant reçu = attendu ⇒ RPC transition_payment confirmed
 *    (acteur admin) + audit payment_confirm_admin ;
 *  - idempotence rejeu : transition « unchanged » ⇒ sans audit en double ;
 *  - rejet : motif obligatoire (400 sans) — RPC rejected + audit avec motif ;
 *  - liste : référence, montant attendu, preuves (txn + capture), drapeau
 *    doublon affiché.
 */
const fake = vi.hoisted(() => ({
  guardOk: false,
  adminUid: "admin-uid-1",
  paymentsRows: [] as Record<string, unknown>[],
  paymentsError: null as { message: string } | null,
  ordersRows: [] as Record<string, unknown>[],
  ordersError: null as { message: string } | null,
  proofQueue: [] as unknown[][],
  proofError: null as { message: string } | null,
  transitionResult: { data: { result: "applied" }, error: null } as {
    data: { result: string } | null;
    error: { message: string } | null;
  },
  transitionCalls: [] as { name: string; args: Record<string, unknown> }[],
  auditInserts: [] as Record<string, unknown>[],
  paymentReadQueue: [] as unknown[][],
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () =>
    fake.guardOk
      ? { ok: true, auth: { userId: fake.adminUid, isAdmin: true, hasMfa: true, aal2: true } }
      : { ok: false, status: 403, error: "mfa_required" },
}));

vi.mock("@/lib/supabase/admin", () => {
  function makeChain(
    table: string,
    settle: () => { data: unknown; error: unknown },
  ) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.single = () => Promise.resolve(settle());
    chain.insert = (row: Record<string, unknown>) => {
      if (table === "audit_logs") fake.auditInserts.push(row);
      return {
        then: (
          onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        ) => Promise.resolve({ data: null, error: null }).then(onFulfilled),
      };
    };
    chain.update = () => chain;
    chain.then = (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(settle()).then(onFulfilled, onRejected);
    return chain;
  }

  return {
    createSupabaseAdminClient: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        fake.transitionCalls.push({ name, args });
        return Promise.resolve(fake.transitionResult);
      },
      from: (table: string) => {
        if (table === "payments") {
          if (fake.paymentReadQueue.length > 0) {
            const q = fake.paymentReadQueue.shift();
            return makeChain(table, () => ({ data: q ?? [], error: null }));
          }
          return makeChain(table, () => ({ data: fake.paymentsRows, error: fake.paymentsError }));
        }
        if (table === "orders") {
          return makeChain(table, () => ({ data: fake.ordersRows, error: fake.ordersError }));
        }
        if (table === "payment_proofs") {
          // File : 1re requête = preuves des paiements listés, 2e = recherche
          // des doublons de référence de transaction.
          const next = Array.isArray(fake.proofQueue) ? fake.proofQueue[0] : null;
          if (next) {
            fake.proofQueue = fake.proofQueue.slice(1);
            return makeChain(table, () => ({ data: next, error: null }));
          }
          return makeChain(table, () => ({ data: [], error: null }));
        }
        return makeChain(table, () => ({ data: [], error: null }));
      },
    }),
  };
});

vi.mock("@/lib/payments/proof", () => ({
  createAdminProofSignedUrl: async (path: string) => `/signed/${path}`,
}));

type RouteModule = typeof import("@/app/api/admin/payments/route");
type ConfirmModule = typeof import("@/app/api/admin/payments/[id]/confirm/route");
type RejectModule = typeof import("@/app/api/admin/payments/[id]/reject/route");

let list: RouteModule["GET"];
let confirm: ConfirmModule["POST"];
let reject: RejectModule["POST"];

const uuid = "11111111-2222-4333-8444-555555555555";
const orderUuid = "22222222-3333-4444-8555-666666666666";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const listMod = await import("@/app/api/admin/payments/route");
  const confirmMod = await import("@/app/api/admin/payments/[id]/confirm/route");
  const rejectMod = await import("@/app/api/admin/payments/[id]/reject/route");
  list = listMod.GET;
  confirm = confirmMod.POST;
  reject = rejectMod.POST;
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.guardOk = true;
  fake.transitionCalls = [];
  fake.auditInserts = [];
  fake.transitionResult = { data: { result: "applied" }, error: null };
  fake.paymentsRows = [];
  fake.paymentsError = null;
  fake.ordersRows = [];
  fake.ordersError = null;
  fake.proofQueue = [];
  fake.proofError = null;
});

describe("liste — garde aal2 sur GET", () => {
  it("sans aal2 ⇒ 403 ; un client ne lit jamais ni la liste ni les captures", async () => {
    fake.guardOk = false;
    const res = await list();
    expect(res.status).toBe(403);
  });

  it("paiements verifying : référence + montant attendu + preuves + drapeau doublon ; capture via URL signée", async () => {
    fake.paymentsRows = [{ id: uuid, order_id: orderUuid, amount_da: 2000, status: "verifying", created_at: "x" }];
    fake.ordersRows = [{ id: orderUuid, reference: "TKF-2601-AB34", status: "pending_payment", total_da: 2000, needs_admin_review: true }];
    fake.proofQueue = [
      [{ id: "proof-1", payment_id: uuid, order_id: orderUuid, txn_reference: "TRX-1", object_path: "o/x.webp", created_at: "x" }],
      [{ id: "proof-1", payment_id: uuid, order_id: orderUuid, txn_reference: "TRX-1", object_path: "o/x.webp", created_at: "x" }, { id: "proof-2", payment_id: "other", order_id: "other-order", txn_reference: "TRX-1", object_path: null, created_at: "x" }],
    ];
    const res = await list();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      payments: Array<{
        reference: string;
        expectedAmountDa: number;
        needsAdminReview: boolean;
        proofs: Array<{ txnReference: string; captureUrl: string | null; duplicate: boolean }>;
      }>;
    };
    expect(data.payments).toHaveLength(1);
    const item = data.payments[0] as NonNullable<(typeof data.payments)[number]>;
    expect(item.reference).toBe("TKF-2601-AB34");
    expect(item.expectedAmountDa).toBe(2000);
    expect(item.needsAdminReview).toBe(true);
    expect(item.proofs[0]?.txnReference).toBe("TRX-1");
    expect(item.proofs[0]?.captureUrl).toContain("/signed/");
    expect(item.proofs[0]?.duplicate).toBe(true); // même référence sur l'autre commande
  });
});

describe("confirmation — montant reçu obligatoire", () => {
  const confirming = async (amountDa: number) =>
    confirm(jsonRequest({ amountDa }), {
      params: Promise.resolve({ id: uuid }) as Promise<{ id: string }>,
    });

  it("sans aal2 ⇒ 403 (test nommé : aucune confirmation accessible sans aal2)", async () => {
    fake.guardOk = false;
    fake.paymentReadQueue = [[{ id: uuid, order_id: orderUuid, amount_da: 2000, status: "verifying" }]];
    const res = await confirming(2000);
    expect(res.status).toBe(403);
    expect(fake.transitionCalls).toHaveLength(0);
    expect(fake.auditInserts).toHaveLength(0);
  });

  it("montant différent (≠ attendu) ⇒ 400 montant_invalide, aucune transition ni audit", async () => {
    fake.paymentReadQueue = [[{ id: uuid, order_id: orderUuid, amount_da: 2000, status: "verifying" }]];
    const res = await confirming(1500);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("montant_invalide");
    expect(fake.transitionCalls).toHaveLength(0);
    expect(fake.auditInserts).toHaveLength(0);
  });

  it("montant exact ⇒ transition confirmed acteur admin + audit payment_confirm_admin (acteur, montant)", async () => {
    fake.paymentReadQueue = [[{ id: uuid, order_id: orderUuid, amount_da: 2000, status: "verifying" }]];
    const res = await confirming(2000);
    expect(res.status).toBe(200);
    expect(fake.transitionCalls).toHaveLength(1);
    expect(fake.transitionCalls[0]?.args).toMatchObject({
      p_payment_id: uuid,
      p_to_status: "confirmed",
      p_actor_role: "admin",
      p_actor_id: "admin-uid-1",
    });
    expect(fake.auditInserts).toHaveLength(1);
    expect(fake.auditInserts[0]).toMatchObject({
      actor_role: "admin",
      action: "payment_confirm_admin",
      entity_id: uuid,
      metadata: { order_id: orderUuid, amount_da: 2000 },
    });
  });

  it("rejeu de la confirmation ⇒ unchanged, AUCUN audit en double (droit ouvert une seule fois)", async () => {
    fake.transitionResult = { data: { result: "unchanged" }, error: null };
    fake.paymentReadQueue = [[{ id: uuid, order_id: orderUuid, amount_da: 2000, status: "verifying" }]];
    const res = await confirming(2000);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { unchanged: boolean };
    expect(body.unchanged).toBe(true);
    expect(fake.auditInserts).toHaveLength(0);
  });

  it("montant manquant ⇒ 400", async () => {
    const res = await confirm(jsonRequest({}), {
      params: Promise.resolve({ id: uuid }) as Promise<{ id: string }>,
    });
    expect(res.status).toBe(400);
  });
});

describe("rejet — motif obligatoire", () => {
  const rejecting = async (reason: unknown) =>
    reject(jsonRequest({ reason }), {
      params: Promise.resolve({ id: uuid }) as Promise<{ id: string }>,
    });

  it("sans aal2 ⇒ 403", async () => {
    fake.guardOk = false;
    const res = await rejecting("preuve non recevable");
    expect(res.status).toBe(403);
  });

  it("motif absent/court ⇒ 400 motif_manquant, aucune transition", async () => {
    for (const reason of [undefined, "", "x"]) {
      const res = await rejecting(reason as string);
      expect(res.status).toBe(400);
    }
    expect(fake.transitionCalls).toHaveLength(0);
  });

  it("motif complet ⇒ transition rejected acteur admin + audit payment_reject_admin AVEC le motif", async () => {
    fake.paymentReadQueue = [[{ id: uuid, order_id: orderUuid, status: "verifying" }]];
    const res = await rejecting("preuve non recevable — reprendre le virement");
    expect(res.status).toBe(200);
    expect(fake.transitionCalls).toHaveLength(1);
    expect(fake.transitionCalls[0]?.args).toMatchObject({
      p_payment_id: uuid,
      p_to_status: "rejected",
      p_actor_role: "admin",
      p_reason: "preuve non recevable — reprendre le virement",
    });
    expect(fake.auditInserts).toHaveLength(1);
    expect(
      (fake.auditInserts[0]?.metadata as { reason: string }).reason,
    ).toBe("preuve non recevable — reprendre le virement");
  });

  it("id inconnu ⇒ 404 y compris avec aal2", async () => {
    fake.paymentReadQueue = [[{ id: uuid, order_id: orderUuid, status: "verifying" }]];
    const res = await reject(jsonRequest({ reason: "reflection" }), {
      params: Promise.resolve({ id: "nul" }) as Promise<{ id: string }>,
    });
    expect(res.status).toBe(404);
  });
});
