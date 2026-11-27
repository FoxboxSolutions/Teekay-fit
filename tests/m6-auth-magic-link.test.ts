import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

/**
 * M6 / M9c — lien magique POST /api/auth/magic-link :
 *  - lien généré par `createLoginLink` (token_hash) puis envoyé par NOTRE
 *    Mailer — GoTrue n'envoie rien ;
 *  - réponse IDENTIQUE et latence comparable que l'e-mail existe ou non
 *    (pas d'énumération, aucune création de compte) ;
 *  - `next` passe par la liste blanche stricte ;
 *  - limitation de débit PAR IP ET PAR E-MAIL — l'e-mail en clair n'atteint
 *    jamais les compteurs (hash HMAC salé).
 */

const state = vi.hoisted(() => ({
  createCalls: [] as Array<{ email: string; next?: string | null }>,
  createError: null as { message: string } | null,
  createDelayMs: 0,
  mailCalls: [] as Array<{ to: string; text?: string }>,
  limitResult: true as boolean,
  limitBuckets: [] as string[],
}));

vi.mock("@/lib/auth/customer-access", () => ({
  createLoginLink: async (input: { email: string; next?: string | null }) => {
    state.createCalls.push(input);
    if (state.createDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, state.createDelayMs));
    }
    if (state.createError) throw new Error(state.createError.message);
    return { url: `http://localhost:3000/fr/auth/confirm?token_hash=${"a".repeat(64)}&type=magiclink` };
  },
}));

vi.mock("@/lib/mailer/provider", () => ({
  getMailer: () => ({
    send: async (mail: { to: string; text?: string }) => {
      state.mailCalls.push(mail);
      return true;
    },
  }),
}));

vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: async (bucket: string) => {
      state.limitBuckets.push(bucket);
      return state.limitResult;
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
  state.createCalls = [];
  state.createError = null;
  state.createDelayMs = 0;
  state.mailCalls = [];
  state.limitResult = true;
  state.limitBuckets = [];
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.5" },
    body: JSON.stringify(body),
  });
}

const NEUTRAL_BODY = '{"ok":true}';

describe("POST /api/auth/magic-link — connexion seule, réponse neutre", () => {
  it("e-mail connu : lien généré, Mailer appelé, 200 {ok:true}", async () => {
    const res = await route.POST(request({ email: "Client@TEST.tk", next: "/fr/admin" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(NEUTRAL_BODY);
    expect(state.createCalls).toEqual([{ email: "Client@TEST.tk", next: "/fr/admin" }]);
    expect(state.mailCalls).toHaveLength(1);
    expect(state.mailCalls[0]?.to).toBe("client@test.tk");
    expect(state.mailCalls[0]?.text).toContain("/fr/auth/confirm?token_hash=");
  });

  it("e-mail inconnu (generateLink en erreur) ⇒ MÊME corps, AUCUN envoi, aucune création", async () => {
    state.createError = { message: "User not found" };
    const res = await route.POST(request({ email: "inconnu@test.tk" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(NEUTRAL_BODY);
    expect(state.mailCalls).toHaveLength(0);
  });

  it("TEST NOMMÉ : latence comparable compte connu / inconnu (plancher neutre)", async () => {
    state.createDelayMs = 40;
    const samples = { known: [] as number[], unknown: [] as number[] };

    for (let i = 0; i < 3; i += 1) {
      state.createError = null;
      let started = performance.now();
      const known = await route.POST(request({ email: "connu@test.tk" }));
      samples.known.push(performance.now() - started);
      expect(known.status).toBe(200);
      expect(await known.text()).toBe(NEUTRAL_BODY);

      state.createError = { message: "User not found" };
      started = performance.now();
      const unknown = await route.POST(request({ email: "inconnu@test.tk" }));
      samples.unknown.push(performance.now() - started);
      expect(unknown.status).toBe(200);
      expect(await unknown.text()).toBe(NEUTRAL_BODY);
    }

    const median = (values: number[]): number =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
    const knownMs = median(samples.known);
    const unknownMs = median(samples.unknown);

    // Le plancher de 150 ms rend les deux branches indiscernables.
    expect(knownMs).toBeGreaterThanOrEqual(140);
    expect(unknownMs).toBeGreaterThanOrEqual(140);
    expect(Math.abs(knownMs - unknownMs)).toBeLessThan(50);
  });

  it("e-mail invalide ⇒ 400 (aucune génération, aucun envoi)", async () => {
    const res = await route.POST(request({ email: "pas-un-email" }));
    expect(res.status).toBe(400);
    expect(state.createCalls).toHaveLength(0);
    expect(state.mailCalls).toHaveLength(0);
  });

  it("next hors liste blanche ⇒ /fr/account (jamais une URL externe)", async () => {
    const res = await route.POST(
      request({ email: "client@test.tk", next: "https://evil.tld" }),
    );
    expect(res.status).toBe(200);
    expect(state.createCalls).toEqual([{ email: "client@test.tk", next: "/fr/account" }]);
  });

  it("limitation de débit : buckets IP ET e-mail, e-mail JAMAIS en clair (HMAC salé) ⇒ 429", async () => {
    state.limitResult = false;
    const res = await route.POST(request({ email: "client@test.tk" }));
    expect(res.status).toBe(429);
    expect(state.createCalls).toHaveLength(0);

    expect(state.limitBuckets).toHaveLength(2);
    const emailBucket =
      state.limitBuckets[0]?.startsWith("auth_magic_email:")
        ? (state.limitBuckets[0] ?? "")
        : (state.limitBuckets[1] ?? "");
    expect(emailBucket.startsWith("auth_magic_email:")).toBe(true);
    const expected = createHmac("sha256", "test-salt-m6").update("client@test.tk").digest("hex");
    expect(emailBucket).toBe(`auth_magic_email:${expected}`);
    for (const bucket of state.limitBuckets) {
      expect(bucket).not.toContain("client@test.tk");
    }
  });
});
