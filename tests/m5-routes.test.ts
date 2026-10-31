import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M5 — routes /api/quiz/submit et /api/contact : refus captcha (échec fermé),
 * honeypot (aucune écriture), anti-énumération, consentement requis, rate limit.
 * Le widget Turnstile est simulé au niveau fetch (siteverify) : tests hermétiques.
 */

const env = getLocalEnv();
const runId = String(Date.now()).slice(-7);

function dzPhone(marker: string): string {
  return `+2136${marker}${runId}`; // +213 + 9 chiffres commençant par 6
}

// Env serveur AVANT les imports dynamiques des routes.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.apiUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= env.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.serviceRoleKey;
process.env.RATE_LIMIT_SALT = "vitest-m5-salt";
process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA"; // clé de test
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

type QuizRoute = typeof import("@/app/api/quiz/submit/route");
type ContactRoute = typeof import("@/app/api/contact/route");

let quizRoute: QuizRoute;
let contactRoute: ContactRoute;
let service: SupabaseClient;

const realFetch = globalThis.fetch;

function mockSiteverify(result: { success: boolean; "error-codes"?: string[] } | "down") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("challenges.cloudflare.com")) {
        if (result === "down") throw new Error("siteverify injoignable");
        return {
          ok: true,
          json: async () => result,
        } as Response;
      }
      // Filet : supabase-js (RPC, etc.) doit recevoir init (méthode, headers, body).
      return realFetch(input as RequestInfo, init ?? undefined);
    }),
  );
}

function quizBody(phone: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Route Test",
    phone,
    email: "",
    answers: {
      objectif: "performance",
      niveau: "debutant",
      dispo: "3_4",
      materiel: "salle",
      preference: "en_ligne",
      budget: "2000_5999",
    },
    consentRecontact: true,
    consentMarketing: false,
    consentAge18: true,
    turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    website: "",
    ...overrides,
  };
}

let ipCounter = 40;
function request(path: string, body: unknown): Request {
  ipCounter += 1;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `198.51.100.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

const trackedPhones: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Compteurs éphémères (fenêtre 600 s) : on repart de zéro pour des tests
  // déterministes même en suite complète ou relance rapprochée.
  await service.from("rate_limit_counters").delete().neq("bucket_key", "");
  quizRoute = await import("@/app/api/quiz/submit/route");
  contactRoute = await import("@/app/api/contact/route");
});

afterAll(async () => {
  if (trackedPhones.length === 0) return;
  const { data: leads } = await service.from("leads").select("id").in("phone_norm", trackedPhones);
  const ids = (leads ?? []).map((l) => l.id);
  if (ids.length > 0) {
    await service.from("quiz_submissions").delete().in("lead_id", ids);
    await service.from("leads").delete().in("id", ids);
  }
});

describe("POST /api/quiz/submit", () => {
  it("refuse sans jeton captcha (échec fermé)", async () => {
    mockSiteverify({ success: true });
    const res = await quizRoute.POST(request("/api/quiz/submit", quizBody(dzPhone("1"), { turnstileToken: undefined })));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "captcha_requis" });
  });

  it("refuse si siteverify est injoignable (échec fermé)", async () => {
    mockSiteverify("down");
    const res = await quizRoute.POST(request("/api/quiz/submit", quizBody(dzPhone("2"))));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "captcha_requis" });
  });

  it("refuse si le consentement obligatoire manque — aucun lead créé", async () => {
    mockSiteverify({ success: true });
    const phone = dzPhone("3");
    trackedPhones.push(phone);
    const res = await quizRoute.POST(
      request("/api/quiz/submit", quizBody(phone, { consentRecontact: undefined })),
    );
    expect(res.status).toBe(400);
    const { data: lead } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", phone)
      .maybeSingle();
    expect(lead).toBeNull();
  });

  it("honeypot rempli ⇒ succès factice et ZÉCRITURE nulle", async () => {
    mockSiteverify({ success: true });
    const phone = dzPhone("4");
    trackedPhones.push(phone);
    const res = await quizRoute.POST(
      request("/api/quiz/submit", quizBody(phone, { website: "http://spam.example" })),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; resultToken: string };
    expect(body.ok).toBe(true);
    expect(body.resultToken).toMatch(/^[A-Za-z0-9_-]{43}$/); // même forme qu'un vrai succès
    const { data: lead } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", phone)
      .maybeSingle();
    expect(lead).toBeNull();
  });

  it("anti-énumération : réponse identique que le numéro existe déjà ou non", async () => {
    mockSiteverify({ success: true });
    const phone = dzPhone("5");
    trackedPhones.push(phone);

    const first = await quizRoute.POST(request("/api/quiz/submit", quizBody(phone)));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { ok: boolean; resultToken: string };

    // Même numéro, nom différent : MÊME forme de réponse, aucun « déjà inscrit ».
    const second = await quizRoute.POST(
      request("/api/quiz/submit", quizBody(phone, { name: "Autre Nom" })),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { ok: boolean; resultToken: string };

    expect(Object.keys(firstBody).sort()).toEqual(Object.keys(secondBody).sort());
    expect(firstBody.resultToken).toHaveLength(secondBody.resultToken.length);

    const { data: leads } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", phone);
    expect(leads).toHaveLength(1);
  });

  it("rate limit : 6e soumission depuis la même IP ⇒ 429", async () => {
    mockSiteverify({ success: true });
    const ip = "198.51.100.200";
    const post = (body: unknown) =>
      new Request("http://localhost/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const phone = dzPhone(`9${i}`.slice(-1));
      if (i < 5) trackedPhones.push(phone);
      const res = await quizRoute.POST(post(quizBody(phone)));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});

describe("POST /api/contact", () => {
  it("honeypot ⇒ succès factice et aucune écriture", async () => {
    mockSiteverify({ success: true });
    const phone = dzPhone("7");
    trackedPhones.push(phone);
    const res = await contactRoute.POST(
      request("/api/contact", {
        name: "Contact Test",
        phone,
        email: "",
        message: "Bonjour, une question.",
        consentRecontact: true,
        consentMarketing: false,
        consentAge18: true,
        turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
        website: "bot@spam",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const { data: lead } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", phone)
      .maybeSingle();
    expect(lead).toBeNull();
  });

  it("soumission valide ⇒ lead avec message dans notes + consentements", async () => {
    mockSiteverify({ success: true });
    const phone = dzPhone("8");
    trackedPhones.push(phone);
    const res = await contactRoute.POST(
      request("/api/contact", {
        name: "Contact Valide",
        phone,
        email: "valide@example.com",
        message: "Message de test M5.",
        consentRecontact: true,
        consentMarketing: true,
        consentAge18: true,
        turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
        website: "",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const { data: lead } = await service
      .from("leads")
      .select("id, source, notes")
      .eq("phone_norm", phone)
      .single();
    expect(lead?.source).toBe("contact");
    expect(lead?.notes).toContain("Message de test M5.");

    const { data: consents } = await service
      .from("consents")
      .select("consent_type")
      .eq("lead_id", lead!.id);
    const types = (consents ?? []).map((c) => c.consent_type).sort();
    expect(types).toEqual(["age_18", "marketing", "recontact"]);
  });
});
