import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * Test NAT (correction avant M9) — rate limit RÉEL (Postgres `check_rate_limit`
 * contre la base LOCALE) via la vraie route POST /api/orders :
 *
 *  - backstop : 31ᵉ requête (e-mails DISTINCTS) depuis la même IP ⇒ 429
 *    (seuil IP 30/600 élargi — un utilisateur légitime derrière une bureau
 *    ou un NAT reste sous le seuil) + en-tête `Retry-After: 600` ;
 *  - relance NAT : 10 e-mails « autres » depuis l'IP X puis UN autre
 *    e-mail ⇒ 200 (l'utilisateur légitime derrière une IP DÉJÀ utilisée
 *    n'est pas pénalisé — avant la correction, seuil IP 10/600 ⇒ 429) ;
 *  - même e-mail × IP distinctes ⇒ 429 à la 6ᵉ (le bucket e-mail 5/600
 *    reste strict malgré l'élargissement IP).
 *
 * Turnstile : secret de test + siteverify simulé au niveau fetch. La purge
 * des compteurs est PAR PRÉFIXE (order_ip / order_ip_fused / order_email)
 * — jamais un truncate global (risque de course avec m5-routes en parallèle).
 * Aucune autre table n'est effacée : les commandes créées sont supprimées en
 * fin de run (meilleur effort) ; les reliquats append-only restent à leur
 * place — la purge systématique est le `supabase db reset` du global setup
 * E2E (base locale uniquement).
 */

const env = getLocalEnv();

// Env serveur AVANT l'import dynamique de la route.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.apiUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= env.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.serviceRoleKey;
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"; // Turnstile : localhost requis
process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA"; // clé de test
process.env.RATE_LIMIT_SALT = "vitest-nat-salt";
process.env.PAYMENT_PROVIDER = "fake";
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
process.env.APP_ENV = "development";

const realFetch = globalThis.fetch;

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("challenges.cloudflare.com")) {
      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    }
    return realFetch(input as RequestInfo, init ?? undefined);
  }),
);

const IP = "203.0.113.220";
let orderRoute: typeof import("@/app/api/orders/route");
let service: SupabaseClient;
let requestSeq = 0;
const createdOrders: { reference: string; email: string }[] = [];

/** Corps valide — même gabarit que m6-api-routes (offre starter réelle en base). */
function validBody(email: string): Record<string, unknown> {
  return {
    offerSlug: "starter",
    name: "Client NAT",
    email,
    consentTerms: true,
    consentPrivacy: true,
    consentRefunds: true,
    turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
  };
}

function orderRequest(ip: string, email: string): Request {
  requestSeq += 1;
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      "Idempotency-Key": `nat-test-${requestSeq}-${Math.random().toString(36).slice(2, 8)}`,
    },
    body: JSON.stringify(validBody(email)),
  });
}

async function submit(ip: string, email: string): Promise<Response> {
  const res = await orderRoute.POST(orderRequest(ip, email));
  if (res.status === 200) {
    const body = (await res.clone().json()) as { reference?: string };
    if (body.reference) createdOrders.push({ reference: body.reference, email });
  }
  return res;
}

/** Purge PAR PRÉFIXE des compteurs de la route orders (fenêtre 600 s). */
async function purgeOrderCounters(): Promise<void> {
  for (const like of ["order_ip:%", "order_ip_fused:%", "order_email:%"]) {
    const { data } = await service
      .from("rate_limit_counters")
      .select("bucket_key")
      .like("bucket_key", like);
    const keys = (data ?? []).map((row) => (row as { bucket_key: string }).bucket_key);
    if (keys.length > 0) {
      await service.from("rate_limit_counters").delete().in("bucket_key", keys);
    }
  }
}

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  orderRoute = await import("@/app/api/orders/route");
});

afterEach(async () => {
  await purgeOrderCounters();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  // Meilleur effort : les commandes créées (base de dev locale) — le
  // `supabase db reset` du global setup E2E est la purge systématique.
  const references = createdOrders.map((o) => o.reference);
  if (references.length > 0) {
    try {
      await service.from("orders").delete().in("reference", references);
    } catch (error) {
      console.warn(
        `[rate-limit-nat] reliquats commandes ignoré : ${(error as Error).message.slice(0, 160)}`,
      );
    }
  }
  for (const k of ["PAYMENT_PROVIDER", "PAYMENT_WEBHOOK_SECRET", "APP_ENV", "RATE_LIMIT_SALT"] as const) {
    delete process.env[k];
  }
});

describe("POST /api/orders — rate limit réel (NAT : IP + e-mail, correction avant M9)", () => {
  it("backstop : 31ᵉ requête (e-mails distincts) depuis la même IP ⇒ 429 + Retry-After 600", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      const res = await submit(IP, `nat-backstop-${i}@test.tkf`);
      statuses.push(res.status);
      if (i < 30) expect(res.status).toBe(200);
    }
    expect(statuses[30]).toBe(429);
    const blocked = await submit(IP, "nat-backstop-late@test.tkf");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("600");
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });

  it("relance NAT : 10 e-mails autres depuis l'IP X puis UN autre e-mail ⇒ 200 (légitime derrière IP utilisée)", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await submit(IP, `nat-relance-avant-${i}@test.tkf`)).status).toBe(200);
    }
    // L'utilisateur légitime derrière cette IP DÉJÀ utilisée soumet le sien.
    const res = await submit(IP, "nat-relance-le-guy@test.tkf");
    expect(res.status).toBe(200);
  });

  it("même e-mail × IP distinctes ⇒ 429 à la 6ᵉ (bucket e-mail 5/600 toujours strict)", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await submit(`203.0.113.${230 + i}`, "nat-flood@test.tkf");
      expect(res.status, `requête ${i + 1} depuis une IP distincte`).toBe(200);
    }
    const sixth = await submit("203.0.113.240", "nat-flood@test.tkf");
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).toBe("600");
  });
});
