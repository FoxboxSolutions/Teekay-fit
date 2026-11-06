import { PDFDocument, StandardFonts, rgb, degrees } from "@cantoo/pdf-lib";

/**
 * M8 (bloc 2a) — Filigrane des PDF livrés.
 *
 * PDFKit (reçus, M7a) GÉNÈRE des PDF mais ne peut pas modifier un PDF
 * existant : le filigrane utilise @cantoo/pdf-lib (fork maintenu de
 * pdf-lib, MIT, version exacte verrouillée) qui charge la source et
 * tamponne CHAQUE page.
 *
 * ÉCART PRD §8 — décision à confirmer (signalée dans milestone.md) :
 * le PRD disait « tamponné au nom et au téléphone » ; ici le téléphone est
 * MASQUÉ (« +213 *** *** 123 ») : un fichier fuité ne doit pas exposer le
 * numéro complet du client. Le nom n'est ajouté que s'il est 100 % latin
 * (WinAnsi) — un nom arabe ne serait pas rendu par la police standard du
 * PDF (caractères cassés) : dans ce cas, seule la référence est apposée.
 *
 * Métadonnées : la référence de commande y figure (title + keywords) —
 * un PDF séparé de son contexte reste rattaché à la commande.
 */

/** WinAnsi (Helvetica standard) : ASCII + Latin-1 — tout le reste est exclu. */
const WIN_ANSI = /^[\u0020-\u007E\u00A0-\u00FF]+$/;

/** Vrai si le texte est 100 % encodable par la police standard du PDF. */
export function isLatinOnly(text: string): boolean {
  return WIN_ANSI.test(text);
}

/**
 * Téléphone MASQUÉ : indicatif conservé, milieu en étoiles, 3 derniers
 * chiffres seuls visibles (« +213 *** *** 123 »). Court ou absent ⇒ « *** ».
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const ccMatch = trimmed.match(/^\+(\d{1,3})/);
  const cc = ccMatch ? `+${ccMatch[1]}` : "";
  const national = (ccMatch ? trimmed.slice(ccMatch[0].length) : trimmed).replace(/\D/g, "");
  if (national.length <= 3) return "***";
  const last3 = national.slice(-3);
  const groups = Math.ceil((national.length - 3) / 3);
  const stars = Array.from({ length: groups }, () => "***").join(" ");
  return `${cc ? `${cc} ` : ""}${stars} ${last3}`;
}

export type WatermarkInput = {
  /** Référence de commande (toujours visible). */
  reference: string;
  /** Nom du client — ajouté SEULEMENT s'il est 100 % latin. */
  clientName?: string | null;
  /** Téléphone — TOUJOURS masqué. */
  phone?: string | null;
};

/**
 * Ligne de filigrane (contenu identique sur chaque page) :
 * marque + référence + [nom si latin] + téléphone masqué.
 */
export function watermarkLine(input: WatermarkInput): string {
  const parts = [`TEEKAY FIT — Commande ${input.reference}`];
  const name = input.clientName?.trim();
  if (name && isLatinOnly(name)) parts.push(name);
  const phone = maskPhone(input.phone);
  if (phone) parts.push(phone);
  return parts.join(" — ");
}

/**
 * Charge le PDF SOURCE et appose le filigrane sur CHAQUE page, puis range
 * la référence dans les métadonnées. Le résultat est un NOUVEAU PDF (la
 * source n'est jamais modifiée ni servie telle quelle).
 *
 * Échec (source corrompue, chiffrée, illisible) : exception — l'appelant
 * (route /api/downloads, bloc 2c) répond « téléchargement indisponible »
 * et journalise sans PII.
 */
export async function stampPdf(
  source: Uint8Array,
  input: WatermarkInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const line = watermarkLine(input);

  // Métadonnées : la référence reste rattachée au fichier.
  doc.setTitle(`Teekay Fit — ${input.reference}`);
  doc.setSubject(`Commande ${input.reference}`);
  doc.setKeywords([input.reference, "Teekay Fit"]);
  doc.setProducer("Teekay Fit");
  doc.setCreator("Teekay Fit");

  const pages = doc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    // Diagonale centrée : taille réduite si la ligne dépasse la diagonale.
    const diagonal = Math.sqrt(width * width + height * height);
    let size = 13;
    let textWidth = font.widthOfTextAtSize(line, size);
    const max = diagonal * 0.85;
    if (textWidth > max) {
      size = Math.max(7, (size * max) / textWidth);
      textWidth = font.widthOfTextAtSize(line, size);
    }
    const rad = Math.PI / 4; // 45°
    page.drawText(line, {
      x: width / 2 - (textWidth / 2) * Math.cos(rad),
      y: height / 2 - (textWidth / 2) * Math.sin(rad),
      size,
      font,
      color: rgb(0.35, 0.35, 0.35),
      opacity: 0.22,
      rotate: degrees(45),
    });
  }

  return doc.save({ useObjectStreams: false });
}
