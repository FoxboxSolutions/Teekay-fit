import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/**
 * Étape 1 — route /fr/payment/simulate/[id] :
 *  - résout seulement si APP_ENV est development/preview explicites
 *    ET PAYMENT_PROVIDER=fake ;
 *  - sinon notFound() (rejet avec digest `NEXT_HTTP_ERROR_FALLBACK;404`) ;
 *  - défaut sûr : APP_ENV absente/invalide ⇒ 404 ;
 *  - metadata : noindex quoi qu'il arrive.
 * Les 5 cas APP_ENV (3 valeurs + absente + invalide) sont couverts.
 *
 * Le routage i18n n'est pas le sujet : next-intl est simulé (getTranslations
 * renvoie la clé, setRequestLocale est un no-op).
 */

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

type PageModule = typeof import("@/app/[locale]/payment/simulate/[id]/page");

let page: PageModule["default"];
let generateMetadata: PageModule["generateMetadata"];

const saved = { APP_ENV: process.env.APP_ENV, PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER };

function setEnv(appEnv: string | undefined, provider: string | undefined) {
  if (appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = appEnv;
  if (provider === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = provider;
}

beforeAll(async () => {
  ({ default: page, generateMetadata } = await import(
    "@/app/[locale]/payment/simulate/[id]/page"
  ));
});

afterAll(() => setEnv(saved.APP_ENV, saved.PAYMENT_PROVIDER));

const params = (id = "TKF-2601-TEST") =>
  Promise.resolve({ locale: "fr", id }) as Promise<{ locale: string; id: string }>;

/** notFound() jette une erreur dont le digest encode le 404. */
async function render() {
  await page({ params: params() });
}

describe("/fr/payment/simulate/[id] — gate", () => {
  it.each([
    ["development", "fake"],
    ["preview", "fake"],
  ])("APP_ENV=%s + PAYMENT_PROVIDER=%s ⇒ la page se rend", async (appEnv, provider) => {
    setEnv(appEnv, provider);
    const element = await page({ params: params() });
    expect(element).toBeTruthy();
  });

  it.each([
    ["production"],
    ["invalide (staging)"],
    ["absente"],
  ])("APP_ENV %s + fake ⇒ 404", async (label) => {
    setEnv(label === "absente" ? undefined : label.startsWith("invalide") ? "staging" : label, "fake");
    await expect(render()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("provider absent ou réel ⇒ 404 même en development/preview", async () => {
    for (const [appEnv, provider] of [
      ["development", undefined],
      ["preview", undefined],
      ["development", "slickpay"],
      ["preview", "manual"],
    ] as const) {
      setEnv(appEnv, provider);
      await expect(render()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    }
  });
});

describe("generateMetadata — noindex", () => {
  it("robots index:false, follow:false (déjà en dev/preview avec fake)", async () => {
    setEnv("development", "fake");
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe("t:metaTitle");
  });
});
