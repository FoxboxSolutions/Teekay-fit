import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M8 (bloc 0a) — /auth/confirm :
 *  - GET : page avec bouton « Se connecter » (le GET ne consomme RIEN) ;
 *  - POST : consomme le token_hash (verifyOtp) — jeton à usage unique ;
 *  - `next` : liste blanche stricte — //, https://, \\ et inconnus ⇒ défaut
 *    (aucune redirection ouverte) ;
 *  - liaison customers APRES vérification réussie, e-mail normalisé ;
 *  - jeton inconnu/expiré/déjà consommé ⇒ redirection NEUTRE identique.
 */

const fake = vi.hoisted(() => ({
  limited: true,
  verifyError: null as { message: string } | null,
  verifyUser: null as { id: string; email: string } | null,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => fake.limited,
  ipRateLimitKey: () => "auth_confirm_ip:hash",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      verifyOtp: async () => {
        if (fake.verifyError) return { data: { user: null }, error: fake.verifyError };
        return { data: { user: fake.verifyUser }, error: null };
      },
    },
  }),
}));

const linkCalls: Array<{ email: string; userId: string }> = [];
vi.mock("@/lib/auth/customer-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/customer-access")>();
  return {
    ...actual,
    linkCustomersAfterVerify: async (input: { email: string; userId: string }) => {
      linkCalls.push(input);
    },
  };
});

const route = await import("@/app/api/auth/confirm/route");

const TOKEN = "a".repeat(64);

function formRequest(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields).toString();
  return new Request("http://localhost/api/auth/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  fake.limited = true;
  fake.verifyError = null;
  fake.verifyUser = { id: "11111111-1111-1111-1111-111111111111", email: "Client@Test.LOCAL " };
  linkCalls.length = 0;
});

function locationOf(res: Response): string {
  return (res.headers.get("location") ?? "").replace(/^https?:\/\/localhost/, "");
}

describe("POST /api/auth/confirm — consommation du lien", () => {
  it("TEST NOMMÉ : POST consomme le token_hash (verifyOtp magiclink) puis lie customers APRES vérification, avec l'e-mail normalisé (trim + minuscules)", async () => {
    const res = await route.POST(formRequest({ token_hash: TOKEN, type: "magiclink", next: "/fr/account" }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe("/fr/account");
    expect(linkCalls).toHaveLength(1);
    expect(linkCalls[0]).toEqual({
      email: "client@test.local", // normalisé
      userId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("redirection ouverte refusée : //host, https://host, \\host et chemin hors liste ⇒ défaut /fr/account (liste blanche)", async () => {
    for (const bad of ["//evil.tld", "https://evil.tld", "\\\\evil.tld", "/fr/unknown", "https:/evil.tld"]) {
      const res = await route.POST(formRequest({ token_hash: TOKEN, type: "magiclink", next: bad }));
      expect(locationOf(res)).toBe("/fr/account");
    }
    // Seuls les chemins de la liste blanche sont honnorés.
    const ok = await route.POST(formRequest({ token_hash: TOKEN, type: "magiclink", next: "/fr" }));
    expect(locationOf(ok)).toBe("/fr");
  });

  it("jeton inconnu, expiré ou DÉJÀ consommé ⇒ redirection neutre identique, AUCUNE liaison customers", async () => {
    fake.verifyError = { message: "invalid claim: token already used" };
    const res = await route.POST(formRequest({ token_hash: TOKEN, type: "magiclink", next: "/fr/account" }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe("/fr/auth/confirm?error=1");
    expect(linkCalls).toHaveLength(0);
  });

  it("token_hash tronqué ou type inattendu ⇒ redirection neutre, verifyOtp jamais appelé", async () => {
    fake.verifyUser = null;
    fake.verifyError = null;
    // Pas d'appel possible si les champs sont invalides : verifyOtp ne doit
    // pas être déclenché (le mock échouerait le test s'il l'était sans user).
    const short = await route.POST(formRequest({ token_hash: "court", type: "magiclink" }));
    expect(locationOf(short)).toBe("/fr/auth/confirm?error=1");
    expect(linkCalls).toHaveLength(0);

    const badType = await route.POST(formRequest({ token_hash: TOKEN, type: "signup" }));
    expect(locationOf(badType)).toBe("/fr/auth/confirm?error=1");
    expect(linkCalls).toHaveLength(0);
  });

  it("rate limit dépassé ⇒ redirection neutre (même page d'erreur), aucune vérification", async () => {
    fake.limited = false;
    const res = await route.POST(formRequest({ token_hash: TOKEN, type: "magiclink" }));
    expect(locationOf(res)).toBe("/fr/auth/confirm?error=1");
    expect(linkCalls).toHaveLength(0);
  });
});

const page = (await import("@/app/[locale]/auth/confirm/page")) as {
  default: (input: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) => Promise<unknown>;
};

describe("page GET /fr/auth/confirm", () => {
  it("TEST NOMMÉ : GET affiche le bouton « Se connecter » (POST) et ne consomme RIEN — jeton en champ caché, aucune authentification au GET", async () => {
    const el = await page.default({
      params: Promise.resolve({ locale: "fr" }),
      searchParams: Promise.resolve({ token_hash: TOKEN, type: "magiclink" }),
    });
    const json = JSON.stringify(el);
    expect(json).toContain("t:signIn");
    expect(json).toContain('"name":"token_hash"');
    expect(json).toContain('"action":"/api/auth/confirm"');
    expect(json).not.toContain("t:expired");
  });

  it("sans jeton ou avec error=1 ⇒ page neutre « lien expiré », AUCUN formulaire de consommation", async () => {
    const missing = await page.default({
      params: Promise.resolve({ locale: "fr" }),
      searchParams: Promise.resolve({}),
    });
    const withError = await page.default({
      params: Promise.resolve({ locale: "fr" }),
      searchParams: Promise.resolve({ token_hash: TOKEN, error: "1" }),
    });
    for (const el of [missing, withError]) {
      const json = JSON.stringify(el);
      expect(json).toContain("t:expired");
      expect(json).not.toContain('"name":"token_hash"');
    }
  });
});
