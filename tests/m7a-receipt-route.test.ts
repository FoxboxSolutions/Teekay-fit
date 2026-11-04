import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * M7a bloc 6 — route du reçu (GET /api/orders/[reference]/receipt) :
 *  - jeton = capacité : format invalide OU inconnu/expiré OU référence
 *    désalignée OU paiement non confirmé ⇒ 404 NEUTRE (aucune différence
 *    observable entre ces cas — pas d'oracle sur l'existence) ;
 *  - commande payée ⇒ PDF réel cohérent (application/pdf, disposition
 *    attachment, cache no-store) ;
 *  - rate limit IP ⇒ 429 ;
 *  - le PDF servi est celui produit par la lib (génération mockée ici,
 *    le rendu réel est couvert par m7a-receipt-lib).
 */
const fake = vi.hoisted(() => ({
  lookup: { status: "found", order: { reference: "TKF-2601-AB34", order_status: "paid" } } as
    | { status: "found"; order: { reference: string; order_status: string } }
    | { status: "missing" },
  rows: [] as { id: string }[],
  limited: false,
}));

vi.mock("@/lib/orders/status", () => ({
  isValidOrderStatusTokenFormat: (t: string) => /^[A-Za-z0-9_-]{16,128}$/.test(t),
  lookupOrderStatus: async () => fake.lookup,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table !== "orders") throw new Error(`table inattendue: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () => Promise.resolve({ data: fake.rows, error: null });
      return chain;
    },
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => !fake.limited,
  ipRateLimitKey: (headers: unknown, name: string) => `${name}:${JSON.stringify(headers)}`,
}));

vi.mock("@/lib/payments/receipt", () => ({
  generateOrderReceipt: async () => ({
    found: true,
    copy: { reference: "TKF-2601-AB34" },
    lines: [],
    pdf: Buffer.from("%PDF-fake-receipt"),
  }),
}));

type RouteModule = typeof import("@/app/api/orders/[reference]/receipt/route");
let GET: RouteModule["GET"];

beforeAll(async () => {
  ({ GET } = await import("@/app/api/orders/[reference]/receipt/route"));
});

const TOKEN = "A".repeat(24);
const REF = "TKF-2601-AB34";

function request(): Request {
  return new Request(`http://localhost/api/orders/${REF}/receipt?statusToken=${TOKEN}`);
}

function withRef(reference: string): { params: Promise<{ reference: string }> } {
  return { params: Promise.resolve({ reference }) as Promise<{ reference: string }> };
}

beforeEach(() => {
  fake.lookup = { status: "found", order: { reference: REF, order_status: "paid" } };
  fake.rows = [{ id: "order-1" }];
  fake.limited = false;
});

describe("route du reçu — le jeton est la capacité", () => {
  it("404 neutre : jeton court, inconnu, ou référence désalignée", async () => {
    const short = new Request(`http://localhost/api/orders/${REF}/receipt?statusToken=court`);
    expect((await GET(short, withRef(REF))).status).toBe(404);

    fake.lookup = { status: "missing" };
    expect((await GET(request(), withRef(REF))).status).toBe(404);

    fake.lookup = {
      status: "found",
      order: { reference: "TKF-OTHER-XY99", order_status: "paid" },
    };
    expect((await GET(request(), withRef(REF))).status).toBe(404);
  });

  it("404 neutre aussi pour un paiement non confirmé (pending/cancelled)", async () => {
    for (const status of ["pending_payment", "cancelled"]) {
      fake.lookup = { status: "found", order: { reference: REF, order_status: status } };
      expect((await GET(request(), withRef(REF))).status).toBe(404);
    }
  });

  it("commande payée ⇒ PDF servi : application/pdf, attachment, no-store, contenu de la lib", async () => {
    const res = await GET(request(), withRef(REF));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(
      'attachment; filename="recu-TKF-2601-AB34.pdf"',
    );
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(body.startsWith("%PDF-")).toBe(true);
  });

  it("rate limit épuisé ⇒ 429", async () => {
    fake.limited = true;
    const res = await GET(request(), withRef(REF));
    expect(res.status).toBe(429);
  });
});
