import { describe, it, expect } from "vitest";
import {
  appEnvStatus,
  readAppEnv,
  isProductionLike,
  isIndexable,
  allowsFakePaymentProvider,
  paymentSimulateAllowed,
  xRobotsTag,
  nonIndexableMeta,
} from "@/lib/env";

/**
 * Audit M4 (d) — APP_ENV : module unique src/lib/env.ts.
 * Défaut sûr si absente/invalide :
 *  - argent/sécurité (fake, simulateur) → comportement production ;
 *  - indexation → non-production (noindex).
 */

const CASES: ReadonlyArray<["development" | "preview" | "production", string]> = [
  ["development", "development"],
  ["preview", "preview"],
  ["production", "production"],
];

describe("appEnvStatus / readAppEnv — 3 valeurs + absente + invalide", () => {
  it.each(CASES)("APP_ENV=%s ⇒ status=%s", (value, status) => {
    expect(appEnvStatus(value)).toBe(status);
    expect(readAppEnv(value)).toBe(value);
  });

  it("absente (undefined ou chaîne vide) ⇒ absent, readAppEnv=null", () => {
    expect(appEnvStatus(undefined)).toBe("absent");
    expect(appEnvStatus("")).toBe("absent");
    expect(readAppEnv(undefined)).toBeNull();
    expect(readAppEnv("")).toBeNull();
  });

  it("invalide ⇒ invalid, readAppEnv=null", () => {
    expect(appEnvStatus("staging")).toBe("invalid");
    expect(appEnvStatus("PRODUCTION")).toBe("invalid");
    expect(readAppEnv("staging")).toBeNull();
  });
});

describe("isProductionLike — argent/sécurité : défaut sûr = production", () => {
  it.each(CASES)("APP_ENV=%s ⇒ %s", (value, expected) => {
    expect(isProductionLike(value)).toBe(expected === "production");
  });

  it("absente ou invalide ⇒ true (comportement production)", () => {
    expect(isProductionLike(undefined)).toBe(true);
    expect(isProductionLike("")).toBe(true);
    expect(isProductionLike("staging")).toBe(true);
  });
});

describe("isIndexable — seule une production explicite est indexable", () => {
  it.each(CASES)("APP_ENV=%s ⇒ %s", (value, expected) => {
    expect(isIndexable(value)).toBe(expected === "production");
  });

  it("absente ou invalide ⇒ false (défaut sûr : noindex)", () => {
    expect(isIndexable(undefined)).toBe(false);
    expect(isIndexable("staging")).toBe(false);
  });
});

describe("allowsFakePaymentProvider — fake refusé hors dev/preview explicites", () => {
  it.each(CASES)("APP_ENV=%s ⇒ %s", (value, expected) => {
    expect(allowsFakePaymentProvider(value)).toBe(
      expected === "development" || expected === "preview",
    );
  });

  it("absente ou invalide ⇒ refusé (défaut sûr)", () => {
    expect(allowsFakePaymentProvider(undefined)).toBe(false);
    expect(allowsFakePaymentProvider("")).toBe(false);
    expect(allowsFakePaymentProvider("staging")).toBe(false);
  });
});

describe("paymentSimulateAllowed — /fr/payment/simulate : 404 hors dev/preview + fake", () => {
  it.each(CASES)("APP_ENV=%s + provider=fake ⇒ %s", (value, expected) => {
    expect(paymentSimulateAllowed(value, "fake")).toBe(
      expected === "development" || expected === "preview",
    );
  });

  it("absente ou invalide + fake ⇒ false (défaut sûr, 404)", () => {
    expect(paymentSimulateAllowed(undefined, "fake")).toBe(false);
    expect(paymentSimulateAllowed("", "fake")).toBe(false);
    expect(paymentSimulateAllowed("staging", "fake")).toBe(false);
  });

  it("provider non fake ou absent ⇒ false même en dev/preview", () => {
    expect(paymentSimulateAllowed("development", undefined)).toBe(false);
    expect(paymentSimulateAllowed("development", "baridimob")).toBe(false);
    expect(paymentSimulateAllowed("preview", "fake")).toBe(true);
  });
});

describe("xRobotsTag / nonIndexableMeta — en-tête et meta hors production", () => {
  it.each(CASES)("APP_ENV=%s ⇒ header %s", (value, expected) => {
    const header = xRobotsTag(value);
    const meta = nonIndexableMeta(value);
    if (expected === "production") {
      expect(header).toBeNull();
      expect(meta).toEqual({});
    } else {
      expect(header).toBe("noindex, nofollow");
      expect(meta).toEqual({ robots: { index: false, follow: false } });
    }
  });

  it("absente ou invalide ⇒ noindex (défaut sûr)", () => {
    expect(xRobotsTag(undefined)).toBe("noindex, nofollow");
    expect(xRobotsTag("staging")).toBe("noindex, nofollow");
    expect(nonIndexableMeta(undefined)).toEqual({
      robots: { index: false, follow: false },
    });
    expect(nonIndexableMeta("staging")).toEqual({
      robots: { index: false, follow: false },
    });
  });
});
