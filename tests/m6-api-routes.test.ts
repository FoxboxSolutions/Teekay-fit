import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

/**
 * M6 — routes POST /api/orders et POST /api/payments/webhook/[provider].
 * Client Supabase simulé (patron tests/offers-health.test.ts) : le contrat
 * HTTP, la garde anti-abus, l'idempotence et le mapping neutre des codes de
 * la RPC. La RPC elle-même est prouvée par tests/m6-db-*.test.ts.
 */

const state = vi.hoisted(() => ({
  // Résultats RPC par nom (create_order / transition_payment).
  rpc: {} as Record<string, { data: unknown; error: { code?: string; message: string } | null }>,
  paymentRow: { id: "pay-1", amount_da: 2000, status: "pending" } as Record<string, unknown> | null,
  paymentReferenceUpdate: null as Record<string, unknown> | null,
  eventInsertRows: [{ id: "evt-row" }] as unknown[],
  transitionCalls: [] as { args: Record<string, unknown> }[],
  paymentEventsCalls: [] as { row: Record<string, unknown> }[],
  auditCalls: [] as { row: Record<string, unknown> }[],
  ipLimited: false,
  emailLimited: false,
}));

vi.mock("@/lib/supabase/admin", () => {
  /** Chaîne supabase-js minimale : select/eq/single/maybeSingle puisable. */
  function chainable(table: string, settle: () => { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.single = () => Promise.resolve(settle());
    chain.maybeSingle = () => Promise.resolve(settle());
    chain.upsert = (row: unknown, _opts?: unknown) => {
      void _opts;
      if (table === "payment_events") {
        state.paymentEventsCalls.push({ row: row as Record<string, unknown> });
      } else if (table === "audit_logs") {
        state.auditCalls.push({ row: row as Record<string, unknown> });
      }
      return chain;
    };
    chain.update = (row: unknown) => {
      state.paymentReferenceUpdate = row as Record<string, unknown>;
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
        const r = state.rpc[name] ?? { data: {}, error: null };
        return Promise.resolve(r);
      },
      from: (table: string) => {
        if (table === "payments") {
          return chainable(table, () => ({ data: state.paymentRow, error: null }));
        }
        if (table === "payment_events") {
          return chainable(table, () => ({ data: state.eventInsertRows, error: null }));
        }
        // audit_logs & autres : succès silencieux.
        return chainable(table, () => ({ data: {}, error: null }));
      },
    }),
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => !(state.ipLimited || state.emailLimited),
  emailRateLimitKey: (email: string, prefix: string) => `${prefix}:${email.length}`,
  ipRateLimitKey: () => "ip-hash",
  clientIp: () => "203.0.113.9",
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstile: async () => true,
}));

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    offerSlug: "starter",
    name: "Client Test",
    email: "client@test.tkf",
    consentTerms: true,
    consentPrivacy: true,
    consentRefunds: true,
    turnstileToken: "test-token",
    ...overrides,
  };
}

let ordersRoute: typeof import("@/app/api/orders/route");
let webhookRoute: typeof import("@/app/api/payments/webhook/[provider]/route");

beforeAll(async () => {
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.APP_ENV = "development";
  process.env.PAYMENT_PROVIDER = "fake";
  ordersRoute = await import("@/app/api/orders/route");
  webhookRoute = await import("@/app/api/payments/webhook/[provider]/route");
});

afterAll(() => {
  for (const key of ["PAYMENT_WEBHOOK_SECRET", "APP_ENV", "PAYMENT_PROVIDER"] as const) {
    delete process.env[key];
  }
});

beforeEach(() => {
  state.rpc = {};
  state.paymentRow = { id: "pay-1", amount_da: 2000, status: "pending" };
  state.paymentReferenceUpdate = null;
  state.eventInsertRows = [{ id: "evt-row" }];
  state.transitionCalls = [];
  state.paymentEventsCalls = [];
  state.auditCalls = [];
  state.ipLimited = false;
  state.emailLimited = false;
  state.rpc.create_order = {
    data: {
      order_id: "ord-1",
      reference: "TKF-2601-AB34",
      total_da: 1760,
      discount_da: 240,
      duplicated: false,
    },
    error: null,
  };
});

describe("POST /api/orders", () => {
  it("création nominale : 200, jeton de statut une fois, lien simulateur, référence de paiement attachée", async () => {
    const res = await ordersRoute.POST(jsonRequest(validBody(), { "Idempotency-Key": "key-1" }));
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      ok: boolean;
      reference: string;
      total_da: number;
      statusToken?: string;
      paymentRedirectUrl: string | null;
      duplicated: boolean;
    };
    expect(out.ok).toBe(true);
    expect(out.reference).toMatch(/^TKF-/);
    expect(out.total_da).toBe(1760);
    expect(out.statusToken).toBeTruthy();
    expect(out.paymentRedirectUrl).toBe("/fr/payment/simulate/TKF-2601-AB34");
    expect(out.duplicated).toBe(false);
    expect(
      (state.paymentReferenceUpdate as { provider_reference?: string } | null)?.provider_reference,
    ).toMatch(/^fake-/);
  });

  it("Idempotency-Key absente ⇒ 400", async () => {
    const res = await ordersRoute.POST(jsonRequest(validBody()));
    expect(res.status).toBe(400);
  });

  it("validation zod : e-mail absent ⇒ 400 invalid_payload", async () => {
    const res = await ordersRoute.POST(
      jsonRequest(validBody({ email: undefined }), { "Idempotency-Key": "key-2" }),
    );
    expect(res.status).toBe(400);
  });

  it("honeypot rempli ⇒ réponse identique à un succès, aucune RPC", async () => {
    const res = await ordersRoute.POST(
      jsonRequest(validBody({ website: "http://spam.tld" }), { "Idempotency-Key": "key-3" }),
    );
    expect(res.status).toBe(200);
    // La garde court-circuite AVANT la RPC : aucune écriture n'a été tentée.
    expect(state.rpc.create_order).toBeDefined(); // même corpus, mais…
    // ...l'appel a été court-circuité par le honeypot : vérifiable via
    // l'absence de mise à jour de référence de paiement.
    expect(state.paymentReferenceUpdate).toBeNull();
  });

  it("rate limit (IP ou e-mail) ⇒ 429", async () => {
    state.ipLimited = true;
    const res = await ordersRoute.POST(jsonRequest(validBody(), { "Idempotency-Key": "key-4" }));
    expect(res.status).toBe(429);
    state.ipLimited = false;
    state.emailLimited = true;
    const res2 = await ordersRoute.POST(jsonRequest(validBody(), { "Idempotency-Key": "key-5" }));
    expect(res2.status).toBe(429);
  });

  it.each([
    ["P4096", 409, "idempotency_conflict"],
    ["P4090", 400, "complet"],
    ["P4008", 400, "creation_refusee"],
  ])("code RPC %s ⇒ HTTP %s, message neutre %s (aucun détail SQL)", async (code, status, neutral) => {
    state.rpc.create_order = { data: null, error: { code, message: "secret interne non exposé" } };
    const res = await ordersRoute.POST(
      jsonRequest(validBody(), { "Idempotency-Key": `key-${code}` }),
    );
    expect(res.status).toBe(status);
    const out = (await res.json()) as { error: string };
    expect(out.error).toBe(neutral);
  });

  it("rejeu idempotent (duplicated) ⇒ 200 sans nouveau jeton de statut", async () => {
    state.rpc.create_order = {
      data: {
        order_id: "ord-1",
        reference: "TKF-2601-AB34",
        total_da: 1760,
        discount_da: 240,
        duplicated: true,
      },
      error: null,
    };
    const res = await ordersRoute.POST(jsonRequest(validBody(), { "Idempotency-Key": "key-1" }));
    expect(res.status).toBe(200);
    const out = (await res.json()) as { statusToken?: string; duplicated: boolean };
    expect(out.duplicated).toBe(true);
    expect(out.statusToken).toBeUndefined();
  });
});

describe("POST /api/payments/webhook/[provider]", () => {
  function signedEvent(providerName = "fake", overrides: Record<string, unknown> = {}): Request {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      id: "evt-1",
      type: "payment.confirmed",
      payment_ref: "fake-abc",
      amount_da: 2000,
      ...overrides,
    });
    const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET as string)
      .update(`${ts}.${body}`)
      .digest("hex");
    return new Request(`http://localhost/api/payments/webhook/${providerName}`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json", "x-signature": signature, "x-timestamp": ts },
    });
  }

  it("vérification OK ⇒ 200 processed + transition_payment confirmée avec l'event id", async () => {
    const res = await webhookRoute.POST(signedEvent(), {
      params: Promise.resolve({ provider: "fake" }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { status: string };
    expect(out.status).toBe("processed");
    expect(state.transitionCalls).toHaveLength(1);
    expect(state.transitionCalls[0]?.args).toMatchObject({
      p_payment_id: "pay-1",
      p_to_status: "confirmed",
      p_actor_role: "webhook",
      p_provider_event_id: "evt-1",
    });
  });

  it("notification répétée (id déjà vu) ⇒ 200 duplicate, transition NE re-PASSE PAS, aucune charge utile stockée", async () => {
    state.eventInsertRows = [];
    const res = await webhookRoute.POST(signedEvent(), {
      params: Promise.resolve({ provider: "fake" }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { status: string };
    expect(out.status).toBe("duplicate");
    expect(state.transitionCalls).toHaveLength(0);
    expect(state.paymentEventsCalls).toHaveLength(1);
    // La table ne reçoit AUCUN payload complet (exigence amendement 8).
    expect(JSON.stringify(state.paymentEventsCalls[0]?.row)).not.toContain("payment_ref");
  });

  it("signature invalide ⇒ 403, aucune transition", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const req = new Request("http://localhost/api/payments/webhook/fake", {
      method: "POST",
      body: JSON.stringify({ id: "evt-1", type: "payment.confirmed", payment_ref: "x", amount_da: 2000 }),
      headers: { "x-signature": "faux", "x-timestamp": ts },
    });
    const res = await webhookRoute.POST(req, { params: Promise.resolve({ provider: "fake" }) });
    expect(res.status).toBe(403);
    expect(state.transitionCalls).toHaveLength(0);
  });

  it("fournisseur demandé ≠ configuré (ou non implémenté) ⇒ 404 uniforme, sans oracle", async () => {
    const res = await webhookRoute.POST(signedEvent(), {
      params: Promise.resolve({ provider: "slickpay" }),
    });
    expect(res.status).toBe(404);
  });

  it("payment_ref inconnu ⇒ 200 ignoré (sans oracle d'état)", async () => {
    state.paymentRow = null;
    const res = await webhookRoute.POST(signedEvent(), {
      params: Promise.resolve({ provider: "fake" }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { status: string };
    expect(out.status).toBe("ignored");
    expect(state.transitionCalls).toHaveLength(0);
  });

  it("montant contredit ⇒ pas de transition, écriture d'audit webhook_amount_mismatch", async () => {
    state.paymentRow = { id: "pay-1", amount_da: 9999, status: "pending" };
    const res = await webhookRoute.POST(signedEvent(), {
      params: Promise.resolve({ provider: "fake" }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { status: string };
    expect(out.status).toBe("ignored");
    expect(state.transitionCalls).toHaveLength(0);
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]?.row).toMatchObject({
      action: "webhook_amount_mismatch",
      entity_type: "payment",
    });
  });
});
