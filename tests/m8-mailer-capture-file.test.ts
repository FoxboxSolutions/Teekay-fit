import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CaptureMailer } from "../src/lib/mailer/mailer";

/**
 * M8 (bloc 6a) — sink fichier OPTIONNEL du CaptureMailer
 * (MAILER_CAPTURE_FILE), seul moyen pour l'E2E Playwright de lire le VRAI
 * lien de connexion émis par l'application (GoTrue generateLink n'envoie
 * aucun e-mail — vérifié : catcher local vide) :
 *  - variable absente ⇒ AUCUN fichier (comportement inchangé) ;
 *  - variable présente ⇒ JSONL append-only lisible (to, subjectKey, text,
 *    at) — le lien /auth/confirm y figure tel quel ;
 *  - échec d'écriture ⇒ JAMAIS fatal : l'envoi retourne true et la
 *    capture mémoire reste intacte ;
 *  - plusieurs envois ⇒ plusieurs lignes (append, jamais d'écrasement).
 */

const MAIL = {
  to: "client@example.dz",
  subjectKey: "account.accessEmail",
  params: {},
  subject: "Teekay Fit — accéder à votre espace et vos PDF",
  text: [
    "Bonjour,",
    "",
    "Connexion (lien unique, valable une fois) :",
    "http://localhost:3000/auth/confirm?token_hash=ABC123&type=magiclink&next=/fr/account",
  ].join("\n"),
};

type CapturedMail = typeof MAIL & { at: string };

let dir: string;
let file: string;
const originalCapture = process.env.MAILER_CAPTURE_FILE;

function readLines(target: string): CapturedMail[] {
  return readFileSync(target, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CapturedMail);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "m8-capture-"));
  file = path.join(dir, "nested", "mails.ndjson");
  delete process.env.MAILER_CAPTURE_FILE;
});

afterEach(() => {
  if (originalCapture === undefined) delete process.env.MAILER_CAPTURE_FILE;
  else process.env.MAILER_CAPTURE_FILE = originalCapture;
  rmSync(dir, { recursive: true, force: true });
});

describe("CaptureMailer — sink MAILER_CAPTURE_FILE (M8 bloc 6a)", () => {
  it("TEST NOMMÉ : sans MAILER_CAPTURE_FILE ⇒ AUCUN fichier écrit (comportement inchangé), capture mémoire seule", async () => {
    const mailer = new CaptureMailer();

    expect(await mailer.send(MAIL)).toBe(true);
    expect(mailer.outbox).toHaveLength(1);
    expect(existsSync(file)).toBe(false);
    // Ni le fichier cible ni son répertoire ne sont créés.
    expect(existsSync(path.dirname(file))).toBe(false);
  });

  it("TEST NOMMÉ : avec MAILER_CAPTURE_FILE ⇒ ligne JSONL contenant le lien de connexion /auth/confirm (lu tel quel par l'E2E)", async () => {
    process.env.MAILER_CAPTURE_FILE = file;
    const mailer = new CaptureMailer();

    expect(await mailer.send(MAIL)).toBe(true);

    expect(existsSync(file)).toBe(true);
    const lines = readLines(file);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ to: MAIL.to, subjectKey: MAIL.subjectKey, text: MAIL.text });
    // Le lien réellement envoyé est lisible pour Playwright.
    expect(lines[0]?.text).toContain("/auth/confirm?token_hash=ABC123");
    expect(typeof lines[0]?.at).toBe("string");
    // La capture mémoire reste alimentée (vitest).
    expect(mailer.outbox).toHaveLength(1);
  });

  it("TEST NOMMÉ : plusieurs envois ⇒ plusieurs lignes (append-only, aucun écrasement)", async () => {
    process.env.MAILER_CAPTURE_FILE = file;
    const mailer = new CaptureMailer();

    await mailer.send(MAIL);
    await mailer.send({ ...MAIL, subjectKey: "order.confirmationEmail" });

    const lines = readLines(file);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.subjectKey)).toEqual(["account.accessEmail", "order.confirmationEmail"]);
  });

  it("TEST NOMMÉ : échec d'écriture (chemin impossible) ⇒ jamais fatal : envoi true + capture mémoire préservée", async () => {
    // Le parent est un FICHIER : mkdir/append échouent (ENOTDIR).
    const blocker = path.join(dir, "blocker");
    writeFileSync(blocker, "x", "utf8");
    process.env.MAILER_CAPTURE_FILE = path.join(blocker, "mails.ndjson");

    const mailer = new CaptureMailer();
    expect(await mailer.send(MAIL)).toBe(true);
    expect(mailer.outbox).toHaveLength(1);
    expect(existsSync(path.join(blocker, "mails.ndjson"))).toBe(false);
  });
});
