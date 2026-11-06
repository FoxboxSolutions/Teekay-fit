import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M7a bloc 7 — page de statut enrichie (/fr/orders/status) :
 *  - pending_payment + fenêtre NON expirée → instructions BaridiMob
 *    (configurées en base, compte affiché, motif = référence) + formulaire
 *    de soumission de preuve branché sur la route du bloc 2 ;
 *  - pending_payment + fenêtre expirée → message clair, AUCUN formulaire
 *    ni numéro de compte ;
 *  - verifying → statut affiché + texte clair, plus aucun formulaire ni
 *    numéro de compte (la preuve est déjà soumise) ;
 *  - paid → lien de téléchargement du reçu PDF (route du bloc 6, jeton =
 *    capacité dans l'URL) ;
 *  - cancelled/refunded → ni formulaire, ni instructions, ni reçu.
 */
type PageModule = typeof import("@/app/[locale]/(public)/orders/status/page");

const fake = vi.hoisted(() => ({
  lookup: { status: "missing" } as unknown,
  windowHours: 48,
  expired: false,
  instructions: {
    account: "002135MP0012345678901",
    bank: "Algérie Poste — BaridiMob",
    beneficiary: "TEEKAY FIT SARL",
    note: null as string | null,
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => true,
  ipRateLimitKey: () => "order_status_ip:hash",
}));

vi.mock("@/lib/orders/status", () => ({
  isValidOrderStatusTokenFormat: (t: string) => t.length >= 16,
  lookupOrderStatus: async () => fake.lookup,
}));

vi.mock("@/lib/settings", () => ({
  getBaridimobInstructions: async () => fake.instructions,
  getPaymentWindowHours: async () => fake.windowHours,
  isPaymentWindowExpired: () => fake.expired,
}));

vi.mock("@/components/site/whatsapp-button", () => ({
  WhatsAppButton: () => null,
}));

vi.mock("@/components/orders/proof-form", () => ({
  ProofForm: function proofFormMock() {
    return null;
  },
}));

const page = (await import("@/app/[locale]/(public)/orders/status/page")) as PageModule;
const { ProofForm } = (await import("@/components/orders/proof-form")) as unknown as {
  ProofForm: (props: { reference: string; token: string }) => null;
};

type Element = { type?: unknown; props?: { children?: unknown; [k: string]: unknown } };

/** Parcours de l'arbre RSC (composants clients JAMAIS exécutés : lus comme types). */
function findElements(node: unknown, type: unknown, out: Element[] = []): Element[] {
  if (node === null || typeof node !== "object") return out;
  const el = node as Element;
  if (el.type === type) out.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) findElements(child, type, out);
  } else {
    findElements(children, type, out);
  }
  return out;
}

const TOKEN = "a".repeat(43);
const REF = "TKF-2601-AB34";
const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

function foundOrder(orderStatus: string) {
  return {
    status: "found",
    order: {
      reference: REF,
      order_status: orderStatus,
      total_da: 3800,
      created_at: "2026-11-03T10:00:00Z",
      status_token_expires_at: "2099-01-01T10:00:00Z",
    },
  };
}

beforeEach(() => {
  fake.lookup = { status: "missing" };
  fake.windowHours = 48;
  fake.expired = false;
  fake.instructions = {
    account: "002135MP0012345678901",
    bank: "Algérie Poste — BaridiMob",
    beneficiary: "TEEKAY FIT SARL",
    note: null,
  };
});

describe("page de statut M7a — paiement en attente", () => {
  it("TEST NOMMÉ : pending non expiré ⇒ instructions BaridiMob (compte, motif = référence, montant) + formulaire de preuve branché sur la référence et le jeton", async () => {
    fake.lookup = foundOrder("pending_payment");
    const el = await page.default({ params, searchParams: Promise.resolve({ token: TOKEN }) });
    const json = JSON.stringify(el);

    expect(json).toContain("t:baridimobTitle");
    expect(json).toContain("002135MP0012345678901"); // compte affiché au client
    expect(json).toContain("t:baridimobMotif");
    expect(json).toContain("t:baridimobAmount");
    // Le motif à recopier EST la référence de commande.
    expect(json).toContain(REF);
    const forms = findElements(el, ProofForm);
    expect(forms).toHaveLength(1);
    expect(forms[0]?.props).toMatchObject({ reference: REF, token: TOKEN });
    // Pas de message d'expiration ni de reçu à ce stade.
    expect(json).not.toContain("t:windowExpiredTitle");
    expect(json).not.toContain("t:receiptAction");
  });

  it("pending + fenêtre expirée ⇒ message clair (payment_window_hours), AUCUN formulaire, AUCUN numéro de compte", async () => {
    fake.lookup = foundOrder("pending_payment");
    fake.expired = true;
    const el = await page.default({ params, searchParams: Promise.resolve({ token: TOKEN }) });
    const json = JSON.stringify(el);

    expect(json).toContain("t:windowExpiredTitle");
    expect(json).not.toContain("002135MP0012345678901");
    expect(findElements(el, ProofForm)).toHaveLength(0);
    expect(json).not.toContain("t:baridimobTitle");
  });
});

describe("page de statut M7a — vérification et confirmation", () => {
  it("TEST NOMMÉ : verifying ⇒ statut affiché + texte clair, plus AUCUN formulaire ni numéro de compte", async () => {
    fake.lookup = foundOrder("verifying");
    const el = await page.default({ params, searchParams: Promise.resolve({ token: TOKEN }) });
    const json = JSON.stringify(el);

    expect(json).toContain("t:verifying");
    expect(json).toContain("t:verifyingTitle");
    expect(findElements(el, ProofForm)).toHaveLength(0);
    expect(json).not.toContain("002135MP0012345678901");
    expect(json).not.toContain("t:receiptAction");
  });

  it("paid ⇒ lien de téléchargement du reçu (route bloc 6) portant référence + jeton ; ni formulaire ni instructions", async () => {
    fake.lookup = foundOrder("paid");
    const el = await page.default({ params, searchParams: Promise.resolve({ token: TOKEN }) });
    const json = JSON.stringify(el);

    expect(json).toContain("t:receiptAction");
    expect(json).toContain(`/api/orders/${REF}/receipt?statusToken=${TOKEN}`);
    expect(json).toContain(`recu-${REF}.pdf`);
    expect(findElements(el, ProofForm)).toHaveLength(0);
    expect(json).not.toContain("002135MP0012345678901");
  });

  it("cancelled ⇒ ni formulaire, ni instructions, ni reçu (rien d'actionnable après annulation)", async () => {
    fake.lookup = foundOrder("cancelled");
    const el = await page.default({ params, searchParams: Promise.resolve({ token: TOKEN }) });
    const json = JSON.stringify(el);

    expect(json).toContain("t:cancelled");
    expect(findElements(el, ProofForm)).toHaveLength(0);
    expect(json).not.toContain("002135MP0012345678901");
    expect(json).not.toContain("t:receiptAction");
    expect(json).not.toContain("t:windowExpiredTitle");
  });
});
