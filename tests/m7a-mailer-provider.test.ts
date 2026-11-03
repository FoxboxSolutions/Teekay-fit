import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * M7a bloc 5 — sélection du mailer PAR VARIABLES D'ENVIRONNEMENT
 * (aucune valeur en dur dans le code) :
 *  - capture explicite → CaptureMailer ;
 *  - resend + clés → ResendMailer (HTTP fetch, pas de dépendance) ;
 *  - resend sans clés → NullMailer + erreur journalisée (jamais de faux
 *    envoi silencieux) ;
 *  - provider inconnu → NullMailer (jamais de repli vers capture) ;
 *  - provider absent : CaptureMailer en dev/preview, NullMailer en
 *    prod-like (défaut sûr).
 * ET ResendMailer.send : POST Bearer → true si 2xx ; rejet → false
 * (message neutre remonté à l'appelant) ; sans sujet/corps → refus local.
 */

const { CaptureMailer, NullMailer } = await import("@/lib/mailer/mailer");
const { getMailer, ResendMailer } = await import("@/lib/mailer/provider");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.MAILER_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

describe("getMailer — configuration par variables d'environnement", () => {
  it("MAILER_PROVIDER=capture ⇒ CaptureMailer (dev/test)", () => {
    expect(getMailer({ provider: "capture" })).toBeInstanceOf(CaptureMailer);
  });

  it("MAILER_PROVIDER=resend sans clés ⇒ NullMailer + erreur journalisée (fail closed)", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => errors.push(String(line)));
    expect(getMailer({ provider: "resend" })).toBeInstanceOf(NullMailer);
    expect(errors.join("\n")).toContain("mailer_misconfigured");
  });

  it("MAILER_PROVIDER inconnu ⇒ NullMailer (jamais un repli silencieux vers capture)", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => errors.push(String(line)));
    expect(getMailer({ provider: "smtp-maison" })).toBeInstanceOf(NullMailer);
    expect(errors.join("\n")).toContain("provider_inconnu");
  });

  it("provider ABSENT en prod-like ⇒ NullMailer (défaut sûr) ; en development ⇒ CaptureMailer", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => errors.push(String(line)));
    expect(getMailer({ provider: undefined, appEnv: "production" })).toBeInstanceOf(NullMailer);
    expect(errors.join("\n")).toContain("mailer_unconfigured");
    expect(getMailer({ provider: undefined, appEnv: "development" })).toBeInstanceOf(CaptureMailer);
  });

  it("MAILER_PROVIDER=resend AVEC clés ⇒ ResendMailer (configuration complète)", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Teekay Fit <no-reply@teekay.fit>";
    expect(getMailer({ provider: "resend" })).toBeInstanceOf(ResendMailer);
  });
});

describe("ResendMailer.send — transport réel minimal (sans dépendance)", () => {
  const mail = {
    to: "client@example.com",
    subjectKey: "payment.notify.confirmed",
    params: { reference: "TKF-2601-AB34", total: "3800" },
    subject: "Commande TKF-2601-AB34 — paiement confirmé",
    text: "Votre paiement est confirmé.",
  };

  it("POST Bearer sur Resend ; 200 ⇒ true", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Teekay Fit <no-reply@teekay.fit>";
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, init });
        return new Response("{}", { status: 200 });
      },
    );
    const mailer = new ResendMailer();
    await expect(mailer.send(mail)).resolves.toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe("https://api.resend.com/emails");
    const headers = new Headers((fetchCalls[0]?.init?.headers ?? {}) as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer re_test_key");
    const body = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      from: string;
      to: string[];
      subject: string;
    };
    expect(body.from).toContain("no-reply@teekay.fit");
    expect(body.to).toEqual(["client@example.com"]);
    expect(body.subject).toBe("Commande TKF-2601-AB34 — paiement confirmé");
  });

  it("rejet du provider (401) ⇒ false, jamais d'exception (message neutre remonté)", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Teekay Fit <no-reply@teekay.fit>";
    vi.stubGlobal("fetch", async () => new Response('{"error":"quota"}', { status: 401 }));
    const mailer = new ResendMailer();
    await expect(mailer.send(mail)).resolves.toBe(false);
  });

  it("sans sujet/corps résolus ⇒ refus local AVANT tout réseau", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Teekay Fit <no-reply@teekay.fit>";
    let called = false;
    vi.stubGlobal("fetch", async () => {
      called = true;
      return new Response("{}", { status: 200 });
    });
    const mailer = new ResendMailer();
    await expect(
      mailer.send({ to: "client@example.com", subjectKey: "k", params: {} }),
    ).resolves.toBe(false);
    expect(called).toBe(false);
  });
});
