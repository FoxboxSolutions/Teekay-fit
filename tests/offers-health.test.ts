import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * Audit M4 (b) — observabilité des offres :
 *  - getOffers() journalise l'erreur via le logger structuré (logEvent JSON) ;
 *  - /api/health expose le décompte d'offres actives et passe en « degraded »
 *    (503) si zéro offre ou si le décompte est inexploitable.
 * Client Supabase simulé au niveau from() : tests hermétiques, sans base.
 */

const mocks = vi.hoisted(() => {
  const state = {
    result: { data: [] as unknown, count: 0 as number | null, error: null as unknown },
    fail: null as Error | null,
  };
  const fromMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const settle = () =>
      state.fail ? Promise.reject(state.fail) : Promise.resolve(state.result);
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => settle();
    chain.then = (onFulfilled: unknown, onRejected?: unknown) =>
      settle().then(onFulfilled as never, onRejected as never);
    return chain;
  });
  return { state, fromMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mocks.fromMock })),
}));

type Queries = typeof import("@/lib/offers/queries");
type HealthRoute = typeof import("@/app/api/health/route");

let getOffers: Queries["getOffers"];
let healthGET: HealthRoute["GET"];

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

function lastLog(): Record<string, unknown> {
  const call = errorSpy.mock.calls.at(-1);
  expect(call, "aucun log error émis").toBeDefined();
  return JSON.parse(String(call?.[0])) as Record<string, unknown>;
}

beforeAll(async () => {
  // Env AVANT l'import des modules (publicClient la lit à l'appel).
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54470";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  process.env.APP_ENV = "production";
  ({ getOffers } = await import("@/lib/offers/queries"));
  ({ GET: healthGET } = await import("@/app/api/health/route"));
});

afterAll(() => {
  errorSpy.mockRestore();
});

beforeEach(() => {
  mocks.state.fail = null;
  mocks.state.result = { data: [], count: 0, error: null };
  errorSpy.mockClear();
});

describe("getOffers — journal structuré (logger logEvent)", () => {
  it("erreur Supabase ⇒ offers.fetch_failed en JSON level=error, retour vide honnête", async () => {
    mocks.state.result = { data: null, count: null, error: { message: "boom" } };

    const out = await getOffers();

    expect(out).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = lastLog();
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("offers.fetch_failed");
    expect(parsed.message).toBe("boom");
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("exception lève ⇒ offers.fetch_exception journalisée, retour vide honnête", async () => {
    mocks.state.fail = new Error("réseau coupé");

    const out = await getOffers();

    expect(out).toEqual([]);
    const parsed = lastLog();
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("offers.fetch_exception");
    expect(parsed.message).toBe("réseau coupé");
  });
});

describe("GET /api/health — décompte offres + statut", () => {
  it("zéro offre active ⇒ degraded (503)", async () => {
    mocks.state.result = { data: null, count: 0, error: null };

    const res = await healthGET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", activeOffers: 0, appEnv: "production" });
  });

  it("offres actives présentes ⇒ ok (200)", async () => {
    mocks.state.result = { data: null, count: 3, error: null };

    const res = await healthGET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", activeOffers: 3, appEnv: "production" });
  });

  it("décompte inexploitable ⇒ degraded (503) + erreur explicite + log structuré", async () => {
    mocks.state.result = { data: null, count: null, error: { message: "down" } };

    const res = await healthGET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "degraded",
      activeOffers: null,
      appEnv: "production",
      activeOffersError: "indisponible",
    });
    // Le décompte échoué est aussi journalisé (offers.count_failed).
    expect(lastLog().event).toBe("offers.count_failed");
  });
});
