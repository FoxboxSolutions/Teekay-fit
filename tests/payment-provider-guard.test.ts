import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Étape 1 / garde fake — `PAYMENT_PROVIDER=fake` :
 *  - refusé si APP_ENV est production, absente ou invalide (défaut sûr) ;
 *  - autorisé en development et preview explicites ;
 *  - appelé par le hook `register` de `src/instrumentation.ts` au démarrage
 *    du serveur ⇒ la config interdite échoue et **le processus ne démarre pas**.
 * Les 5 cas : les 3 valeurs + absente + invalide.
 */

type Loader = typeof import("@/lib/payments/loader");
type Instrumentation = { register: () => Promise<void> };

let assertPaymentProviderConfig: Loader["assertPaymentProviderConfig"];
let PAYMENT_PROVIDERS: Loader["PAYMENT_PROVIDERS"];
let register: Instrumentation["register"];

const saved = { APP_ENV: process.env.APP_ENV, PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER };

function setEnv(appEnv: string | undefined, provider: string | undefined) {
  if (appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = appEnv;
  if (provider === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = provider;
}

beforeAll(async () => {
  ({ assertPaymentProviderConfig, PAYMENT_PROVIDERS } = await import("@/lib/payments/loader"));
  ({ register } = (await import("@/instrumentation")) as Instrumentation);
});

afterAll(() => {
  setEnv(saved.APP_ENV, saved.PAYMENT_PROVIDER);
});

/** APP_ENV explicite ou undefined (absent). */
function appEnvFor(label: "development" | "preview" | "production" | "absent" | "invalid"): string | undefined {
  return label === "absent" ? undefined : label === "invalid" ? "staging" : label;
}

const CASES: ReadonlyArray<["development" | "preview" | "production" | "absent" | "invalid", boolean]> = [
  ["development", false],
  ["preview", false],
  ["production", true],
  ["absent", true],
  ["invalid", true],
];

describe("assertPaymentProviderConfig — PAYMENT_PROVIDER=fake", () => {
  it.each(CASES)("%s ⇒ échec=%s", (label, mustFail) => {
    setEnv(appEnvFor(label), "fake");
    if (mustFail) {
      expect(() => assertPaymentProviderConfig()).toThrow("PAYMENT_PROVIDER=fake refusé");
    } else {
      expect(() => assertPaymentProviderConfig()).not.toThrow();
    }
  });

  it("APP_ENV avec espace «  Preview  » est invalide pour zod ⇒ fake refusé (pas de trim caché)", () => {
    setEnv(" Preview ", " FAKE ");
    expect(() => assertPaymentProviderConfig()).toThrow("PAYMENT_PROVIDER=fake refusé : APP_ENV=invalid");
  });
});

describe("assertPaymentProviderConfig — provider non fake ou absent", () => {
  it("provider absent ou vide ⇒ jamais de refus (rien à tester)", () => {
    for (const provider of [undefined, "", "  "]) {
      for (const appEnv of [undefined, "production", "staging", "development", "preview"]) {
        setEnv(appEnv, provider);
        expect(() => assertPaymentProviderConfig()).not.toThrow();
      }
    }
  });

  it("les 4 providers déclarés sont connus (contrainte SQL payments_provider_check)", () => {
    expect(new Set(PAYMENT_PROVIDERS)).toEqual(new Set(["slickpay", "chargily", "manual", "fake"]));
  });

  it("provider réel (slickpay/chargily/manual) ⇒ pas de refus, même en production", () => {
    for (const provider of ["slickpay", "chargily", "manual"]) {
      setEnv("production", provider);
      expect(() => assertPaymentProviderConfig()).not.toThrow();
    }
  });
});

describe("register() (src/instrumentation.ts) — le processus ne démarre pas", () => {
  it("fake + production-like (les 3 cas) ⇒ register rejette et échoue au démarrage", async () => {
    for (const appEnv of ["production", undefined, "staging"]) {
      setEnv(appEnv, "fake");
      // Le message expose le statut typé (production / absent / invalid),
      // jamais la valeur brute.
      await expect(register()).rejects.toThrow(/^PAYMENT_PROVIDER=fake refusé : APP_ENV=(production|absent|invalid)/);
    }
  });

  it("fake + development / preview ⇒ register passe (serveur démarre)", async () => {
    for (const appEnv of ["development", "preview"]) {
      setEnv(appEnv, "fake");
      await expect(register()).resolves.toBeUndefined();
    }
  });

  it("runtime edge ⇒ hook court-circuité (aucune logique de paiement en edge)", async () => {
    const previous = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "edge";
    setEnv("production", "fake"); // interdit — doit être ignoré en edge
    try {
      await expect(register()).resolves.toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = previous;
    }
  });
});
