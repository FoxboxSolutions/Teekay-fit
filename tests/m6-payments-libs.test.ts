import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { CaptureMailer, NullMailer, type Mailer } from "@/lib/mailer/mailer";
import { createStatusToken, hashStatusToken } from "@/lib/payments/status-token";
import { FakePaymentProvider, fakeWebhookSignature } from "@/lib/payments/fake";
import { WebhookVerificationError } from "@/lib/payments/provider";

/**
 * M6 — couche fournisseur (amendements 5, 8, 10) :
 *  - jeton de statut ≥128 bits + hash SHA-256 (page neutre) ;
 *  - webhook : corps brut, HMAC + tolérance d'horodatage, comparaison en
 *    temps constant, AUCUN secret/payload dans les messages d'erreur ;
 *  - Mailer : interface + implémentation de capture (aucun réseau).
 */

const SAVED_ENV = {
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET,
  APP_ENV: process.env.APP_ENV,
};

beforeAll(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
});

afterAll(() => {
  for (const [k, v] of Object.entries(SAVED_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function validEventBody(overrides: Partial<Record<string, unknown>> = {}): { ts: string; body: string } {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    id: "evt-123",
    type: "payment.confirmed",
    payment_ref: "fake-abc",
    amount_da: 2000,
    ...overrides,
  });
  return { ts, body };
}

describe("fake provider — webhook (corps brut + HMAC + tolérance)", () => {
  const provider = new FakePaymentProvider();

  async function expectRejected(options: {
    signature?: string | null;
    timestamp?: string | null;
    body?: string;
  }) {
    const { ts, body } = { ts: String(Math.floor(Date.now() / 1000)), body: options.body ?? JSON.stringify({}) };
    await expect(
      provider.verifyWebhook(
        { signature: options.signature ?? null, timestamp: options.timestamp ?? ts },
        body,
      ),
    ).rejects.toThrowError(WebhookVerificationError);
  }

  it("vérification valide : l'événement signé est accepté et retourné", async () => {
    const { ts, body } = validEventBody();
    const sig = createHmac("sha256", "test-webhook-secret").update(`${ts}.${body}`).digest("hex");
    const event = await provider.verifyWebhook({ signature: sig, timestamp: ts }, body);
    expect(event).toMatchObject({ id: "evt-123", type: "payment.confirmed", payment_ref: "fake-abc", amount_da: 2000 });
  });

  it("signature absente, invalide ou falsifiée ⇒ rejet (aucun payload dans l'erreur)", async () => {
    await expectRejected({ signature: null });
    await expectRejected({ signature: "deadbeef" });
    const { ts, body } = validEventBody();
    await expectRejected({
      signature: createHmac("sha256", "mauvais-secret").update(`${ts}.${body}`).digest("hex"),
      body,
    });
  });

  it("tolérance d'horodatage : rejet hors fenêtre (vieux 1 h), accepté dans la fenêtre (vieil 10 s)", async () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
    const recent = String(Math.floor(Date.now() / 1000) - 10);
    const { ts, body } = validEventBody();
    await expectRejected({ signature: fakeWebhookSignature(oldTs, body), timestamp: oldTs, body });
    const event = await provider.verifyWebhook(
      { signature: fakeWebhookSignature(recent, body), timestamp: recent },
      body,
    );
    expect(event.type).toBe("payment.confirmed");
    void ts;
  });

  it("entête horloge non numérique ⇒ rejet", async () => {
    await expectRejected({ timestamp: "not-a-number" });
  });

  it("corps invalide (JSON cassé ou champ hors contrat) ⇒ rejet, sans révéler le contenu", async () => {
    const { ts } = validEventBody();
    for (const bad of ["{pas du JSON", JSON.stringify({ id: "x" })]) {
      await expectRejected({ signature: fakeWebhookSignature(ts, bad), timestamp: ts, body: bad });
    }
    // Aucun message d'erreur n'expose le secret de vérification.
    try {
      await provider.verifyWebhook({ signature: "x".repeat(64), timestamp: "1" }, "{}");
    } catch (err) {
      expect((err as Error).message).not.toContain("test-webhook-secret");
      expect((err as Error).message).not.toContain("{");
    }
  });
});

describe("fake provider — createPayment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("référence locale unique + lien simulateur (page 404 hors dev/preview)", async () => {
    const provider = new FakePaymentProvider();
    const a = await provider.createPayment({ orderId: "o1", paymentId: "p1", amountDa: 2000, reference: "TKF-2601-AB34" });
    const b = await provider.createPayment({ orderId: "o2", paymentId: "p2", amountDa: 6000, reference: "TKF-2601-CD56" });
    expect(a.providerReference).toMatch(/^fake-[0-9a-f-]{36}$/);
    expect(b.providerReference).toMatch(/^fake-[0-9a-f-]{36}$/);
    expect(a.providerReference).not.toEqual(b.providerReference);
    expect(a.redirectUrl).toBe("/fr/payment/simulate/TKF-2601-AB34");
  });
});

describe("status-token — ≥128 bits, hashé, expirable", () => {
  it("jeton 256 bits (base64url ≥ 43 caractères), hash = SHA-256 du jeton", () => {
    const { token, hash, expiresAt } = createStatusToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashStatusToken(token));
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 13.5 * 86_400_000);
  });

  it("imprévisible : deux jetons consécutifs diffèrent (aucun compteur public)", () => {
    const a = createStatusToken();
    const b = createStatusToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.hash).not.toEqual(b.hash);
  });
});

describe("getPaymentProvider — fabrique (garde + refus explicite)", () => {
  it("absent/vide ⇒ null ; manual ⇒ null (BaridiMob M7) ; fake ⇒ implémentation fictive", async () => {
    const { getPaymentProvider } = await import("@/lib/payments/loader");
    delete process.env.PAYMENT_PROVIDER;
    expect(getPaymentProvider()).toBeNull();
    process.env.PAYMENT_PROVIDER = "manual";
    expect(getPaymentProvider()).toBeNull();
    try {
      // fake n'est autorisé qu'en development/preview explicites.
      process.env.APP_ENV = "development";
      process.env.PAYMENT_PROVIDER = "fake";
      const provider = getPaymentProvider();
      expect(provider?.name).toBe("fake");
    } finally {
      delete process.env.APP_ENV;
    }
  });

  it.each([
    ["production"],
    ["absente"], // défaut sûr = production-like
  ])("fake + APP_ENV %s ⇒ PaymentProviderConfigError (démarrage refusé)", async (_label) => {
    const { getPaymentProvider, PaymentProviderConfigError } = await import("@/lib/payments/loader");
    process.env.PAYMENT_PROVIDER = "fake";
    if (_label === "absente") delete process.env.APP_ENV;
    else process.env.APP_ENV = _label;
    expect(() => getPaymentProvider()).toThrowError(PaymentProviderConfigError);
  });

  it("fournisseur réel non implémenté ⇒ refus explicite (aucun faux paiement)", async () => {
    const { getPaymentProvider, PaymentProviderConfigError } = await import("@/lib/payments/loader");
    for (const name of ["slickpay", "chargily", "inconnu"]) {
      process.env.PAYMENT_PROVIDER = name;
      expect(() => getPaymentProvider()).toThrowError(PaymentProviderConfigError);
    }
  });
});

describe("Mailer — interface + implémentation de capture (aucun réseau)", () => {
  it("CaptureMailer : capture, i18n clé + params (aucun texte en dur dans le Mailer)", async () => {
    const mailer = new CaptureMailer();
    const sent = await mailer.send({
      to: "client@test.tkf",
      subjectKey: "order.confirmationEmail",
      params: { reference: "TKF-2601-AB34", total: "2 000 DA" },
    });
    expect(sent).toBe(true);
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]).toMatchObject({ to: "client@test.tkf", subjectKey: "order.confirmationEmail" });
  });

  it("NullMailer : repli explicite, no-op, jamais de crash sur l'e-mail", async () => {
    const mailer: Mailer = new NullMailer();
    await expect(mailer.send({ to: "x@test.tkf", subjectKey: "k", params: {} })).resolves.toBe(false);
  });
});
