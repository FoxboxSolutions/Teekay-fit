import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * M9c — page /auth/confirm : le `next` reçu en query est validé CÔTÉ
 * SERVEUR avant d'être recopié dans le formulaire POST. Une valeur externe
 * ne doit jamais apparaître dans le HTML.
 */

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

type PageModule = typeof import("@/app/[locale]/auth/confirm/page");
let page: PageModule["default"];

beforeAll(async () => {
  ({ default: page } = await import("@/app/[locale]/auth/confirm/page"));
});

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;
const TOKEN = "a".repeat(64);

function render(next: string): Promise<string> {
  return page({
    params,
    searchParams: Promise.resolve({ token_hash: TOKEN, next }),
  }).then((element) => renderToStaticMarkup(element));
}

describe("page /auth/confirm — next validé avant le POST", () => {
  it("conserve /fr/admin (destination de connexion admin)", async () => {
    const html = await render("/fr/admin");
    expect(html).toContain('name="next" value="/fr/admin"');
  });

  it("TEST NOMMÉ : une destination externe est remplacée par /fr/account dans le HTML", async () => {
    for (const bad of [
      "https://evil.tld",
      "//evil.tld",
      "%2F%2Fevil.tld",
      "/fr/admin/../account",
      "/FR/ADMIN",
      " /fr/admin",
    ]) {
      const html = await render(bad);
      expect(html, `next=${bad}`).toContain('name="next" value="/fr/account"');
      expect(html, `next=${bad}`).not.toContain("evil.tld");
    }
  });
});
