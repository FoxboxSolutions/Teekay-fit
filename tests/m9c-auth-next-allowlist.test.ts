import { beforeAll, describe, it, expect } from "vitest";
import { buildConfirmUrl } from "@/lib/auth/customer-access";
import { DEFAULT_NEXT_PATH, safeNextPath } from "@/lib/auth/redirect-paths";

/**
 * M9c — liste blanche `next` de la connexion (Option A) :
 *  - seules `/fr/admin` et `/fr/account` sont acceptées ;
 *  - toute tentative de sortie de site (absolue, protocole-relative,
 *    antislash, encodage, traversée, casse, espaces) retombe sur le défaut.
 */

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

const REJECTED = [
  "https://evil.tld",
  "http://evil.tld",
  "//evil.tld",
  "%2F%2Fevil.tld",
  "\\evil.tld",
  "/fr/admin/../account",
  "/fr/admin%2F..%2Faccount",
  "/FR/ADMIN",
  " /fr/admin",
  "/fr/admin ",
  "/fr/admin\n",
  "/fr/admin?x=1",
  "/fr/admin#fragment",
  "/fr",
  "/fr/login",
  "/fr/account/",
  "",
];

describe("safeNextPath — liste blanche stricte", () => {
  it("accepte uniquement /fr/admin et /fr/account", () => {
    expect(safeNextPath("/fr/admin")).toBe("/fr/admin");
    expect(safeNextPath("/fr/account")).toBe("/fr/account");
  });

  it("TEST NOMMÉ : refuse toute redirection vers un autre site ou chemin inconnu", () => {
    for (const value of REJECTED) {
      expect(safeNextPath(value), `next=${JSON.stringify(value)}`).toBe(DEFAULT_NEXT_PATH);
    }
  });

  it("refuse les valeurs non-chaînes", () => {
    for (const value of [null, undefined, 42, {}, ["/fr/admin"]]) {
      expect(safeNextPath(value)).toBe(DEFAULT_NEXT_PATH);
    }
  });
});

describe("buildConfirmUrl — le lien magique ne peut pas sortir du site", () => {
  it("conserve /fr/admin et /fr/account", () => {
    for (const next of ["/fr/admin", "/fr/account"]) {
      const url = new URL(buildConfirmUrl({ hashedToken: "a".repeat(64), next }).url);
      expect(url.searchParams.get("next")).toBe(next);
    }
  });

  it("TEST NOMMÉ : une destination externe est remplacée par /fr/account", () => {
    for (const next of REJECTED) {
      const url = new URL(buildConfirmUrl({ hashedToken: "a".repeat(64), next }).url);
      expect(url.searchParams.get("next"), `next=${JSON.stringify(next)}`).toBe("/fr/account");
    }
    const absolute = new URL(
      buildConfirmUrl({ hashedToken: "a".repeat(64), next: "https://evil.tld" }).url,
    );
    expect(absolute.host).toBe("localhost:3000");
    expect(absolute.pathname).toBe("/auth/confirm");
  });
});
