import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

/**
 * M9a (ajustement validé) — MFA : limite PAR UTILISATEUR en plus de l'IP.
 *  - 5 échecs TOTP / 15 min ⇒ la requête suivante est bloquée (429) ET
 *    AUDITÉE (audit_logs `mfa_user_blocked`, sans aucune donnée du code) ;
 *  - chaque échec s'incrémente UNIQUEMENT sur échec (les 200 ne
 *    consomment rien) ;
 *  - un succès enregistre le moment de vérification MFA (durée absolue de
 *    session admin, défaut 12 h — cf. m7a-admin-aal2-guard.test.ts) ;
 *  - même mécanique pour les codes de secours (phase « recovery »).
 */

const fake = vi.hoisted(() => ({
  verifyError: null as unknown,
  recoveryConsumed: true,
  failures: 0, // échecs MFA enregistrés (compteur partagé : un seul bucket par test)
  auditInserts: [] as Record<string, unknown>[],
  recordedSessions: [] as (string | null)[],
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: async () => ({
    ok: true,
    auth: { userId: "u-admin", isAdmin: true, hasMfa: true, aal2: false, sessionId: "sess-1" },
  }),
  recordAdminMfaSession: async (userId: string, sessionId: string | null) => {
    void userId;
    fake.recordedSessions.push(sessionId);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      mfa: {
        challengeAndVerify: async () => ({
          data: fake.verifyError ? null : { ok: true },
          error: fake.verifyError,
        }),
        listFactors: async () => ({ data: { all: [] }, error: null }),
        unenroll: async () => ({ data: null, error: null }),
      },
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "audit_logs") {
        return {
          insert: (row: Record<string, unknown>) => {
            fake.auditInserts.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`table inattendue: ${table}`);
    },
  }),
}));

vi.mock("@/lib/auth/mfa-recovery", () => ({
  consumeRecoveryCode: async () => fake.recoveryConsumed,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (bucket: string): boolean => {
    // Compteur réel simulé : l'IP n'est jamais bloquée dans ces tests ;
    // seul le bucket utilisateur compte (appelé UNIQUEMENT sur échec).
    if (bucket.startsWith("mfa_verify_user:") || bucket.startsWith("mfa_recovery_user:")) {
      fake.failures += 1;
    }
    return true;
  },
  ipRateLimitKey: (_headers: unknown, name: string) => `${name}:hash`,
  peekRateLimit: (): number => fake.failures,
  userRateLimitKey: (userId: string, prefix: string) => `${prefix}:<hmac(${userId})>`,
}));

let verifyRoute: typeof import("@/app/api/admin/mfa/verify/route");
let recoveryRoute: typeof import("@/app/api/admin/mfa/recovery/route");

beforeAll(async () => {
  verifyRoute = await import("@/app/api/admin/mfa/verify/route");
  recoveryRoute = await import("@/app/api/admin/mfa/recovery/route");
});

afterEach(() => {
  fake.verifyError = null;
  fake.recoveryConsumed = true;
  fake.failures = 0;
  fake.auditInserts = [];
  fake.recordedSessions = [];
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/mfa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.30" },
    body: JSON.stringify(body),
  });
}

describe("MFA — limite PAR UTILISATEUR (5 échecs / 15 min, audité)", () => {
  it("5 échecs TOTP enregistrés, la 6ᵉ requête ⇒ 429 + Retry-After 900 + audit `mfa_user_blocked`", async () => {
    fake.verifyError = { message: "totp_invalid" };
    for (let i = 0; i < 5; i += 1) {
      const res = await verifyRoute.POST(jsonRequest({ factorId: "f1", code: "000000" }));
      expect(res.status, `échec ${i + 1}`).toBe(400);
    }
    expect(fake.failures).toBe(5);
    expect(fake.auditInserts).toHaveLength(0); // aucun blocage déclenché avant le 6ᵉ

    fake.verifyError = null; // même un code VALIDE est refusé pendant le blocage
    const blocked = await verifyRoute.POST(jsonRequest({ factorId: "f1", code: "123456" }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("900");
    expect(fake.auditInserts).toHaveLength(1);
    const row = fake.auditInserts[0] as Record<string, unknown>;
    expect(row.action).toBe("mfa_user_blocked");
    expect(row.metadata).toMatchObject({ phase: "verify" });
  });

  it("un SUCCÈS ne consomme aucun essai et enregistre le moment de vérification", async () => {
    const res = await verifyRoute.POST(jsonRequest({ factorId: "f1", code: "123456" }));
    expect(res.status).toBe(200);
    expect(fake.failures).toBe(0);
    expect(fake.recordedSessions).toEqual(["sess-1"]);
  });

  it("codes de secours : 5 échecs ⇒ blocage 429 AUDITÉ (phase `recovery`)", async () => {
    fake.recoveryConsumed = false;
    for (let i = 0; i < 5; i += 1) {
      const res = await recoveryRoute.POST(
        new Request("http://localhost/api/admin/mfa/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "AAAAA-BBBBB" }),
        }),
      );
      expect(res.status, `échec recovery ${i + 1}`).toBe(400);
    }
    fake.recoveryConsumed = true; // code VALIDE : refusé quand même (blocage)
    const blocked = await recoveryRoute.POST(
      new Request("http://localhost/api/admin/mfa/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "CCCCC-DDDDD" }),
      }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("900");
    expect(fake.auditInserts[0]).toMatchObject({ action: "mfa_user_blocked" });
    expect((fake.auditInserts[0] as Record<string, unknown>).metadata).toMatchObject({
      phase: "recovery",
    });
  });

  it("succès recovery enregistre aussi la session MFA (durée absolue)", async () => {
    const res = await recoveryRoute.POST(
      new Request("http://localhost/api/admin/mfa/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AAAAA-BBBBB" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(fake.recordedSessions).toEqual(["sess-1"]);
  });
});
