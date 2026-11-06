import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { stampPdf, watermarkLine, maskPhone, isLatinOnly } from "@/lib/files/watermark";
import { extractPdfText } from "./helpers/pdf-text";

/**
 * M8 (bloc 2a) — Filigrane des PDF livrés (écart PRD à confirmer :
 * téléphone MASQUÉ, jamais le numéro complet) :
 *  - chaque page tamponnée (référence présente UNE FOIS PAR PAGE) ;
 *  - téléphone masqué présent, numéro COMPLET absent (jamais) ;
 *  - nom ajouté seulement s'il est latin ; nom arabe ⇒ référence seule,
 *    aucun caractère cassé, aucune erreur ;
 *  - référence dans les métadonnées du PDF.
 * Les PDF de test sont GÉNÉRÉS dans le test (aucun fichier réel au dépôt).
 */

const REF = "TKF-2601-M8WM";
const FULL_PHONE = "+213555123456"; // 12 chiffres — ne doit JAMAIS apparaître

/** PDF fictif 2 pages (généré à la volée — jamais de PDF réel au dépôt). */
async function makeSourcePdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i + 1} — programme fictif`, { x: 50, y: 780, size: 12, font });
  }
  return doc.save({ useObjectStreams: false });
}

describe("maskPhone — téléphone toujours masqué", () => {
  it("algérien : indicatif conservé, milieu étoilé, 3 derniers chiffres seuls", () => {
    expect(maskPhone("+213555123456")).toBe("+213 *** *** 456");
    expect(maskPhone("0555123456")).toBe("*** *** *** 456");
    expect(maskPhone(null)).toBe("");
    expect(maskPhone("123")).toBe("***");
  });

  it("le numéro complet n'apparaît jamais dans la ligne de filigrane", () => {
    const line = watermarkLine({ reference: REF, clientName: "Amine", phone: FULL_PHONE });
    expect(line).not.toContain(FULL_PHONE);
    expect(line).not.toContain("555123456");
    expect(line).toContain("+213 *** *** 456");
  });
});

describe("stampPdf — filigrane sur chaque page", () => {
  it("TEST NOMMÉ : référence présente sur CHAQUE page (une occurrence par page), téléphone masqué présent et numéro complet absent, métadonnées portant la référence", async () => {
    const source = await makeSourcePdf(2);
    const stamped = await stampPdf(source, {
      reference: REF,
      clientName: "Amine Bensalem",
      phone: FULL_PHONE,
    });

    const text = extractPdfText(stamped);
    // 2 pages ⇒ 2 occurrences exactes du filigrane portant la référence.
    const occurrences = text.split(REF).length - 1;
    expect(occurrences).toBe(2);
    expect(text).toContain("+213 *** *** 456");
    expect(text).toContain("Amine Bensalem");
    // Numéro complet JAMAIS dans le flux du PDF.
    expect(text).not.toContain(FULL_PHONE);
    expect(text).not.toContain("555123456");

    // Métadonnées : référence rattachée au fichier.
    const meta = await PDFDocument.load(stamped);
    expect(meta.getTitle()).toContain(REF);
    expect(meta.getKeywords() ?? []).toContain(REF);
    expect(meta.getSubject()).toContain(REF);
  });

  it("TEST NOMMÉ : nom ARABE ⇒ aucune erreur, aucun caractère cassé, seule la référence est apposée (pas de police arabe en standard PDF)", async () => {
    const source = await makeSourcePdf(1);
    const arabicName = "أحمد بن يوسف";
    expect(isLatinOnly(arabicName)).toBe(false);

    const stamped = await stampPdf(source, {
      reference: REF,
      clientName: arabicName,
      phone: FULL_PHONE,
    });

    const text = extractPdfText(stamped);
    // Le nom arabe n'est JAMAIS dessiné (police standard = caractères
    // cassés) : ni arabe, ni U+FFFD dans le texte extrait.
    expect(text).not.toContain("أحمد");
    expect(text).not.toContain("�");
    // La référence et le téléphone masqué restent présents.
    expect(text).toContain(REF);
    expect(text).toContain("+213 *** *** 456");
  });

  it("nom latin accentué (WinAnsi) accepté ; source intacte (le filigrane ne modifie pas l'original)", async () => {
    const source = await makeSourcePdf(1);
    expect(isLatinOnly("José Muñoz-Ç")).toBe(true);
    const stamped = await stampPdf(source, {
      reference: REF,
      clientName: "José Muñoz-Ç",
      phone: null,
    });
    expect(extractPdfText(stamped)).toContain("José Muñoz-Ç");

    // La source n'est jamais réécrite : le PDF d'origine reste lisible et
    // ne contient pas le filigrane.
    const sourceText = extractPdfText(source);
    expect(sourceText).not.toContain(REF);
    expect(sourceText).toContain("Page 1");
  });

  it("source corrompue ou chiffrée ⇒ exception (route : « téléchargement indisponible », bloc 2c)", async () => {
    await expect(stampPdf(Buffer.from("%PDF-corrompu"), { reference: REF })).rejects.toThrow();
    // PDF réel mais chiffré (mot de passe) : ignoreEncryption:false ⇒ échec.
    const fakeEncrypted = Buffer.concat([
      Buffer.from("%PDF-1.6\n1 0 obj\n<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -44 >>\nendobj\n"),
      Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF"),
    ]);
    await expect(stampPdf(fakeEncrypted, { reference: REF })).rejects.toThrow();
  });
});
