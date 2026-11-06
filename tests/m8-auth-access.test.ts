import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M8 (bloc 3b) — POST /api/auth/access (« Accéder à mon espace ») :
 *  - réponse { ok: true } TOUJOURS identique (même corps, 200) : jeton
 *    inconnu, commande non payée, e-mail absent, erreur d'envoi — aucune
 *    différence observable (pas d'oracle de paiement ni de commande) ;
 *  - e-mail de connexion envoyé UNIQUEMENT sur paiement confirmé, avec un
 *    lien vers /fr/account (JAMAIS /api/downloads ni URL de fichier) ;
 *  - rate limit IP ⇒ 429 ; format de jeton invalide ⇒ 400 ;
 *  - jamais fatal : une erreur serveur reste { ok: true }.
 */

const fake = vi.hoisted(() => ({
  lookup: { status: "missing" } as
    | { status: "found"; order: { reference: string; order_status: string } }
    | { status: "missing" },
  orderRows: [] as Array<{ id: string; customers: { email: string | null } | null }>,
  limited: false,
  ensureCalls: [] as string[],
  linkCalls: [] as Array<{ email: string; next: string }>,
  mails: [] as Array<{ to: string; subjectKey: string; text: string }>,
  mailError: false as boolean,
  ensureError: false as boolean,
}));

vi.mock("@/lib/orders/status", () => ({
  isValidOrderStatusTokenFormat: (t: string) => /^[A-Za-z0-9_-]{16,128}$/.test(t),
  lookupOrderStatus: async () => fake.lookup,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => !fake.limited,
  ipRateLimitKey: (headers: unknown, name: string) => `${name}:${JSON.stringify(headers)}`,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table !== "orders") throw new Error(`table inattendue: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () => Promise.resolve({ data: fake.orderRows, error: null });
      return chain;
    },
  }),
}));

vi.mock("@/lib/auth/customer-access", () => ({
  ensureCustomerAccount: async (input: { email: string }) => {
    if (fake.ensureError) throw new Error("boom ensure");
    fake.ensureCalls.push(input.email.trim().toLowerCase());
    return { userId: "u-1", email: input.email, created: false };
  },
  createLoginLink: async (input: { email: string; next: string }) => {
    fake.linkCalls.push({ email: input.email, next: input.next });
    return { url: `http://localhost:3000/auth/confirm?token=LINK-${fake.linkCalls.length}` };
  },
}));

vi.mock("@/lib/mailer/provider", () => ({
  getMailer: () => ({
    send: async (mail: { to: string; subjectKey: string; text: string }) => {
      if (fake.mailError) throw new Error("boom mail");
      fake.mails.push(mail);
      return true;
    },
  }),
}));

type RouteModule = typeof import("@/app/api/auth/access/route");
const { POST } = (await import("@/app/api/auth/access/route")) as RouteModule;

const TOKEN = "A".repeat(24);

function request(body: unknown = { statusToken: TOKEN }): Request {
  return new Request("http://localhost/api/auth/access", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

function paidOrder(email: string | null) {
  fake.lookup = { status: "found", order: { reference: "TKF-2601-AB34", order_status: "paid" } };
  fake.orderRows = [{ id: "order-1", customers: email === null ? null : { email } }];
}

beforeEach(() => {
  fake.lookup = { status: "missing" };
  fake.orderRows = [];
  fake.limited = false;
  fake.ensureCalls = [];
  fake.linkCalls = [];
  fake.mails = [];
  fake.mailError = false;
  fake.ensureError = false;
});

describe("POST /api/auth/access — relance d'accès (M8)", () => {
  it("TEST NOMMÉ : réponse { ok: true } IDENTIQUE (corps + statut) quel que soit le cas — inconnu, non payé, payé, erreur d'envoi", async () => {
    // 1) Jeton inconnu.
    const resMissing = await POST(request());
    // 2) Commande non payée.
    fake.lookup = { status: "found", order: { reference: "TKF-2601-AB34", order_status: "pending_payment" } };
    const resPending = await POST(request());
    // 3) Payée avec e-mail (envoi effectué).
    paidOrder("CLIENT@Example.dz");
    const resPaid = await POST(request());
    // 4) Erreur serveur pendant l'envoi.
    paidOrder("CLIENT@Example.dz");
    fake.mailError = true;
    const resError = await POST(request());

    const bodies: string[] = [];
    for (const res of [resMissing, resPending, resPaid, resError]) {
      expect(res.status).toBe(200);
      bodies.push(JSON.stringify(await res.json()));
    }
    // Les réponses sont strictement identiques (même corps dans tous les cas).
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toBe(JSON.stringify({ ok: true }));
  });

  it("TEST NOMMÉ : e-mail envoyé UNIQUEMENT sur paiement confirmé (aucun envoi : jeton inconnu, non payé, e-mail absent)", async () => {
    await POST(request()); // inconnu
    fake.lookup = { status: "found", order: { reference: "TKF-2601-AB34", order_status: "verifying" } };
    await POST(request()); // non payé
    paidOrder(null); // payée mais sans e-mail client
    await POST(request());

    expect(fake.mails).toHaveLength(0);
    expect(fake.ensureCalls).toHaveLength(0);
    expect(fake.linkCalls).toHaveLength(0);

    paidOrder("client@example.dz");
    await POST(request());

    expect(fake.mails).toHaveLength(1);
    expect(fake.ensureCalls).toEqual(["client@example.dz"]);
  });

  it("TEST NOMMÉ : l'e-mail contient le lien de connexion /fr/account et JAMAIS de lien de téléchargement", async () => {
    paidOrder("client@example.dz");
    await POST(request());

    const mail = fake.mails[0];
    expect(mail).toBeDefined();
    expect(mail?.subjectKey).toBe("account.accessEmail");
    expect(mail?.text).toContain("/auth/confirm?token=");
    expect(mail?.text).toContain("Connexion (lien unique");
    // Ni fichier, ni URL de téléchargement, ni jeton de statut dans le mail.
    expect(mail?.text).not.toContain("/api/downloads");
    expect(mail?.text).not.toContain(TOKEN);
    expect(mail?.text).not.toContain(".pdf");
    // Le lien pointe vers l'espace (next validé côté confirm).
    expect(fake.linkCalls[0]?.next).toBe("/fr/account");
  });

  it("TEST NOMMÉ : erreur serveur (compte ou envoi) ⇒ jamais fatal : { ok: true } journalisé, pas de 500", async () => {
    paidOrder("client@example.dz");
    fake.ensureError = true;
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    fake.ensureError = false;
    fake.mailError = true;
    const res2 = await POST(request());
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ ok: true });
  });

  it("TEST NOMMÉ : format de jeton invalide ⇒ 400 ; rate limit IP ⇒ 429 (avant toute lecture)", async () => {
    const bad = await POST(request({ statusToken: "court" }));
    expect(bad.status).toBe(400);

    fake.limited = true;
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(fake.lookup).toEqual({ status: "missing" }); // aucune lecture avant la limite
  });
});
