import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M8 (bloc 3a) — branche SESSION de la route du reçu
 * (GET /api/orders/[reference]/receipt SANS statusToken) :
 *  - sans session ⇒ 404 neutre (aucune capacité) ;
 *  - session + commande payée appartenant au client (RLS) ⇒ PDF servi ;
 *  - session + commande inconnue / d'un autre client (RLS ne renvoie
 *    rien) ⇒ 404 IDENTIQUE ;
 *  - session + commande non payée ⇒ 404 (aucun reçu) ;
 *  - statusToken PRÉSENT ⇒ comportement M7a strict (le jeton est la
 *    seule capacité, aucun repli session : jeton invalide ⇒ 404 même
 *    avec une session valide).
 */

const fake = vi.hoisted(() => ({
  auth: null as { userId: string } | null,
  rows: [] as Array<{ id: string; status: string; reference: string }>,
  limited: false,
  lookup: { status: "missing" } as
    | { status: "found"; order: { reference: string; order_status: string } }
    | { status: "missing" },
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: async () => fake.auth,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      if (table !== "orders") throw new Error(`table inattendue: ${table}`);
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        filters.push([col, val]);
        return chain;
      };
      chain.limit = () =>
        Promise.resolve({
          // Émulation honnête des filtres eq (y compris status = paid).
          data: fake.rows.filter((r) =>
            filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
          ),
          error: null,
        });
      return chain;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table !== "orders") throw new Error(`table inattendue: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () => Promise.resolve({ data: [{ id: "order-token" }], error: null });
      return chain;
    },
  }),
}));

vi.mock("@/lib/orders/status", () => ({
  isValidOrderStatusTokenFormat: (t: string) => /^[A-Za-z0-9_-]{16,128}$/.test(t),
  lookupOrderStatus: async () => fake.lookup,
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
const { GET } = (await import("@/app/api/orders/[reference]/receipt/route")) as RouteModule;

const REF = "TKF-2601-AB34";
const TOKEN = "A".repeat(24);

function request(query = ""): Request {
  return new Request(`http://localhost/api/orders/${REF}/receipt${query}`);
}

function withRef(reference: string): { params: Promise<{ reference: string }> } {
  return { params: Promise.resolve({ reference }) as Promise<{ reference: string }> };
}

beforeEach(() => {
  fake.auth = null;
  fake.rows = [];
  fake.limited = false;
  fake.lookup = { status: "missing" };
});

describe("route du reçu — branche session (M8)", () => {
  it("TEST NOMMÉ : sans session (et sans jeton) ⇒ 404 neutre, aucun PDF", async () => {
    fake.auth = null;
    fake.rows = [{ id: "order-1", status: "paid", reference: REF }];
    const res = await GET(request(), withRef(REF));
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBeNull();
  });

  it("TEST NOMMÉ : session + commande payée du client (RLS) ⇒ PDF servi (application/pdf, attachment, no-store)", async () => {
    fake.auth = { userId: "11111111-1111-4111-8111-111111111111" };
    fake.rows = [{ id: "order-1", status: "paid", reference: REF }];
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

  it("TEST NOMMÉ : session + commande inconnue ou d'un AUTRE client (RLS ⇒ rien) ⇒ 404 IDENTIQUE, aucun PDF", async () => {
    fake.auth = { userId: "11111111-1111-4111-8111-111111111111" };
    // RLS : la commande n'appartient pas au profil ⇒ aucune ligne retournée.
    fake.rows = [];
    const res = await GET(request(), withRef(REF));
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBeNull();
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("TEST NOMMÉ : session + commande NON payée ⇒ 404 (aucun reçu avant confirmation)", async () => {
    fake.auth = { userId: "11111111-1111-4111-8111-111111111111" };
    for (const status of ["pending_payment", "cancelled", "refunded"]) {
      fake.rows = [{ id: "order-1", status, reference: REF }];
      const res = await GET(request(), withRef(REF));
      expect(res.status).toBe(404);
    }
  });

  it("TEST NOMMÉ : statusToken présent ⇒ capacité par le JETON seule (M7a) : jeton inconnu ⇒ 404 même avec une session valide", async () => {
    // Session valide ET ligne payée disponibles : le jeton reste décisif.
    fake.auth = { userId: "11111111-1111-4111-8111-111111111111" };
    fake.rows = [{ id: "order-1", status: "paid", reference: REF }];
    fake.lookup = { status: "missing" };

    const res = await GET(request(`?statusToken=${TOKEN}`), withRef(REF));
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBeNull();
  });

  it("rate limit épuisé ⇒ 429 (avant toute lecture, jeton ou session)", async () => {
    fake.limited = true;
    fake.auth = { userId: "11111111-1111-4111-8111-111111111111" };
    fake.rows = [{ id: "order-1", status: "paid", reference: REF }];
    const res = await GET(request(), withRef(REF));
    expect(res.status).toBe(429);
  });
});
