import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

/**
 * M6 — lien magique /api/auth/magic-link (décisions amendées) :
 *  - connexion seule : aucune inscription publique (signups désactivés en
 *    config, une erreur OTP est avalée) ;
 *  - réponse IDENTIQUE que l'e-mail existe ou non (pas d'énumération) ;
 *  - limitation de débit PAR IP ET PAR E-MAIL — l'e-mail en clair n'atteint
 *    jamais les compteurs (hash HMAC salé).
 */

const otpState = vi.hoisted(() => ({
  otpCalls: [] as { payload: unknown }[],
  otpError: null as { message: string } | null,
  limitResult: true as boolean,
  limitBuckets: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithOtp: async (payload: unknown) => {
        otpState.otpCalls.push({ payload });
        return { error: otpState.otpError, data: otpState.otpError ? null : {} };
      },
    },
  }),
}));

vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: async (bucket: string) => {
      otpState.limitBuckets.push(bucket);
      return otpState.limitResult;
    },
  };
});

let route: typeof import("@/app/api/auth/magic-link/route");

beforeAll(async () => {
  process.env.RATE_LIMIT_SALT = "test-salt-m6";
  route = await import("@/app/api/auth/magic-link/route");
});

afterAll(() => {
  delete process.env.RATE_LIMIT_SALT;
});

beforeEach(() => {
  otpState.otpCalls = [];
  otpState.otpError = null;
  otpState.limitResult = true;
  otpState.limitBuckets = [];
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.5" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/magic-link — connexion seule, réponse neutre", () => {
  it("e-mail connu : OTP envoyé (redirect URL racine) ⇒ 200 {ok:true}", async () => {
    const res = await route.POST(request({ email: "Client@TEST.tk" }));
    expect(res.status).toBe(200);
    const out = (await res.json()) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(otpState.otpCalls).toHaveLength(1);
    const payload = otpState.otpCalls[0]?.payload as {
      email: string;
      options?: { emailRedirectTo?: string };
    };
    expect(payload.email).toBe("Client@TEST.tk");
    expect(payload.options?.emailRedirectTo).toContain("/");
  });

  it("e-mail inconnu (signups publics désactivés : OTP en erreur) ⇒ 200 {ok:true} IDENTIQUE", async () => {
    otpState.otpError = { message: "Signups not allowed" };
    const res = await route.POST(request({ email: "inconnu@test.tk" }));
    expect(res.status).toBe(200);
    const out = (await res.json()) as { ok: boolean };
    expect((out as unknown as Record<string, unknown>).ok).toBe(true);
    // Forme strictement identique au succès (aucun champ de plus, mutice).
  });

  it("e-mail invalide ⇒ 400 (aucune écriture, aucun OTP)", async () => {
    const res = await route.POST(request({ email: "pas-un-email" }));
    expect(res.status).toBe(400);
    expect(otpState.otpCalls).toHaveLength(0);
  });

  it("limitation de débit : buckets IP ET e-mail, e-mail JAMAIS en clair (HMAC salé) ⇒ 429", async () => {
    otpState.limitResult = false;
    const res = await route.POST(request({ email: "client@test.tk" }));
    expect(res.status).toBe(429);
    expect(otpState.otpCalls).toHaveLength(0);

    expect(otpState.limitBuckets).toHaveLength(2);
    const emailBucket =
      otpState.limitBuckets[0]?.startsWith("auth_magic_email:")
        ? (otpState.limitBuckets[0] ?? "")
        : (otpState.limitBuckets[1] ?? "");
    expect(emailBucket.startsWith("auth_magic_email:")).toBe(true);
    // Le hash attendu est le HMAC salé de l'e-mail normalisé (jamais le clair).
    const expected = createHmac("sha256", "test-salt-m6").update("client@test.tk").digest("hex");
    expect(emailBucket).toBe(`auth_magic_email:${expected}`);
    for (const bucket of otpState.limitBuckets) {
      expect(bucket).not.toContain("client@test.tk");
    }
  });
});
