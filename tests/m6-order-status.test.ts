import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { isValidOrderStatusTokenFormat, lookupOrderStatus } from "@/lib/orders/status";

/**
 * M6 — lib src/lib/orders/status.ts (page de suivi neutre).
 * La RPC order_status_by_token elle-même est prouvée côté DB
 * (tests/m6-db-transitions.test.ts : inconnu = expiré = absence, identique).
 * Ici : le jeton brut n'atteint JAMAIS la base (hashé SHA-256 avant l'appel),
 * la forme est vérifiée avant tout accès, échec base ⇒ « missing » (page
 * neutre identique — aucune différenciation inconnu/erreur/rejeté).
 */

const spy = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  result: { data: [] as unknown, error: null as unknown },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      spy.calls.push({ name, args });
      return Promise.resolve(spy.result);
    },
  }),
}));

const TOKEN = "abcdef0123456789ghijklmnopqrstuvwxyz-_-_"; // base64url 43+ car.

beforeEach(() => {
  spy.calls = [];
  spy.result = { data: [], error: null };
});

describe("lookupOrderStatus — jeton haché avant la base, page neutre", () => {
  it("le jeton BRUT n'atteint jamais la RPC : le hash SHA-256 est envoyé seul", async () => {
    spy.result = {
      data: [{ reference: "TKF-2601-AB34", order_status: "pending_payment", total_da: 1760 }],
      error: null,
    };
    const out = await lookupOrderStatus(TOKEN);
    expect(out.status).toBe("found");
    if (out.status === "found") {
      expect(out.order.reference).toBe("TKF-2601-AB34");
      expect(out.order.order_status).toBe("pending_payment");
      expect(out.order.total_da).toBe(1760);
    }
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]?.name).toBe("order_status_by_token");
    expect(spy.calls[0]?.args).toEqual({
      p_status_token_hash: createHash("sha256").update(TOKEN).digest("hex"),
    });
    // Aucun fragment du jeton brut dans les arguments.
    expect(JSON.stringify(spy.calls[0]?.args)).not.toContain(TOKEN);
  });

  it("aucune ligne (inconnu OU expiré — précisément la sémantique RPC) ⇒ missing", async () => {
    const out = await lookupOrderStatus(TOKEN);
    expect(out.status).toBe("missing");
  });

  it("erreur base ⇒ missing (page neutre identique, jamais de crash)", async () => {
    spy.result = { data: null, error: { message: "boom" } };
    // console.error attendu ; le résultat reste neutre.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const out = await lookupOrderStatus(TOKEN);
      expect(out.status).toBe("missing");
    } finally {
      err.mockRestore();
    }
  });

  it("page neutre : absent, inconnu, expiré et erreur renvoient le MÊME shape {status:'missing'}", async () => {
    // La page ne reçoit jamais de raison : seule absence/présence de jeton.
    const a = await lookupOrderStatus(TOKEN); // inconnu
    spy.result = { data: null, error: { message: "x" } };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await lookupOrderStatus(TOKEN); // erreur base
    err.mockRestore();
    expect(a).toEqual(b);
  });
});

describe("isValidOrderStatusTokenFormat — forme avant base (aucun SQL injectable)", () => {
  it("base64url 16–128 caractères accepté ; autres formes refusées sans accès base", async () => {
    expect(isValidOrderStatusTokenFormat("a".repeat(43))).toBe(true);
    expect(isValidOrderStatusTokenFormat("a".repeat(16))).toBe(true);
    expect(isValidOrderStatusTokenFormat("a".repeat(128))).toBe(true);

    for (const bad of ["", "court", "a".repeat(129), "avec espace x", "slash/hui", "é" + "a".repeat(40), "point.sehle"]) {      expect(isValidOrderStatusTokenFormat(bad)).toBe(false);
    }
  });
});
