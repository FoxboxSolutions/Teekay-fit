import { describe, it, expect } from "vitest";
import zlib from "node:zlib";

/**
 * M7a bloc 6 — reçu PDF :
 *  - intitulé « REÇU » (bandeau police display Barlow Condensed, OFL) ;
 *  - COPIE FIGÉE : chaque ligne du reçu dérive STRICTEMENT de la commande
 *    enregistrée (jamais recalculée) — test nommé de cohérence reçu ⇄
 *    copie figée ; remise affichée UNIQUEMENT si presente ;
 *  - rendu PDF réel (pdfkit 0.20.2, seule lib de génération) : %PDF-,
 *    flux inflatés contenant les valeurs figées, metadata Title REÇU ;
 *  - une seule page, poids minimal (aucune image embarquée).
 *
 * La route (jeton = capacité, refus si commande non confirmée) est couverte
 * par tests/m7a-receipt-route.test.ts ; la page par bloc 7.
 */
import { buildReceiptLines, formatDA, renderReceiptPdf, type ReceiptCopy } from "@/lib/payments/receipt";

const copy: ReceiptCopy = {
  reference: "TKF-2601-AB34",
  customerName: "Yacine B.",
  customerEmail: "yacine@test.local",
  offerName: "Coaching Online",
  unitPriceDa: 4200,
  discountDa: 400,
  totalDa: 3800,
  items: [{ name: "Coaching Online", quantity: 1, subtotalDa: 4200 }],
  paidAtIso: "2026-11-03T10:15:00.000Z",
  status: "paid",
};

describe("formatDA — montant avec séparateur fr", () => {
  it("3 800 DA (séparateur milliers, espace insécable fine)", () => {
    expect(formatDA(3800)).toContain("800 DA");
    expect(formatDA(3800)).not.toContain("$");
  });
});

describe("buildReceiptLines — intitulé REÇU + copie figée", () => {
  it("l'intitulé REÇU est la première ligne du reçu", () => {
    const lines = buildReceiptLines(copy);
    expect(lines[0]).toMatchObject({ label: "Titre", value: "REÇU", emphasis: true });
  });

  it("TEST NOMMÉ : chaque ligne est cohérente avec la copie figée (jamais recalculée)", () => {
    const lines = buildReceiptLines(copy);
    const norm = (v: unknown) => String(v ?? "").replace(/[\u202f\u00a0]/g, " ");
    const byLabel = new Map(lines.map((l) => [l.label, norm(l.value)]));
    expect(byLabel.get("Référence")).toBe("TKF-2601-AB34");
    expect(byLabel.get("Client")).toBe("Yacine B.");
    expect(byLabel.get("Article")).toBe("Coaching Online");
    expect(byLabel.get("Prix unitaire")).toContain("4 200 DA");
    expect(byLabel.get("Remise")).toContain("400 DA");
    // Le TOTAL PAYÉ est exactement le total figé de la commande.
    expect(byLabel.get("TOTAL PAYÉ")).toContain("3 800 DA");
    expect(byLabel.get("Payé le")).toBe("3 novembre 2026");
    expect(byLabel.get("Moyen de paiement")).toContain("BaridiMob");
  });

  it("sans remise : la ligne Remise n'apparaît pas", () => {
    const lines = buildReceiptLines({ ...copy, discountDa: 0, totalDa: 4200 });
    expect(lines.map((l) => l.label)).not.toContain("Remise");
    const norm = (v: unknown) => String(v ?? "").replace(/[\u202f\u00a0]/g, " ");
    const byLabel = new Map(lines.map((l) => [l.label, norm(l.value)]));
    expect(byLabel.get("TOTAL PAYÉ")).toContain("4 200 DA");
  });
});

describe("renderReceiptPdf — PDF réel (pdfkit, Helvetica + Barlow OFL)", () => {
  it("octets valides : %PDF-, une page, poids minimal, fonts attendues", async () => {
    const pdf = await renderReceiptPdf(copy);
    expect(pdf.slice(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeLessThan(200_000);
    expect(pdf.length).toBeGreaterThan(3_000);
    expect(pdf.toString("latin1")).toContain("/Page");
    // Corps : Helvetica (standard, WinAnsi = accents) ; titres : Barlow OFL.
    expect(pdf.toString("latin1")).toContain("Helvetica");
    expect(pdf.toString("latin1")).toContain("BarlowCondensed");
  });

  it("les flux décompressés contiennent les valeurs de la copie figée", async () => {
    const pdf = await renderReceiptPdf(copy);
    // Extraction de tous les flux FlateDecode (pdfkit compresse en zlib).
    let raw = "";
    let idx = pdf.indexOf("stream");
    while (idx !== -1) {
      const start = pdf.indexOf("\n", idx) + 1;
      const end = pdf.indexOf("endstream", start);
      if (end === -1) break;
      const chunk = pdf.subarray(start, end);
      try {
        raw += zlib.inflateSync(chunk).toString("latin1");
      } catch {
        // flux non compressé ou binaire : ignoré
      }
      idx = pdf.indexOf("stream", end);
    }
    // Les entiers nus ENTRE DEUX JETONS "> n <" sont du crénage (kerning),
    // jamais du texte : retirés d'abord, puis hexadécimal décodé — les
    // chaînes textuelles (montants inclus) restent ENTIÈRES.
    const text = raw
      .replace(/>\s*-?\d+\s*</g, "><")
      .replace(/<([0-9a-fA-F]+)>/g, (_m, hex: string) =>
        Buffer.from(hex, "hex").toString("latin1"),
      )
      // Séparateurs Intl (narrow no-break) artefacts encodés → collés.
      .replace(/[\u202f\u00a0/]/g, "")
      .replace(/\s+/g, "");
    expect(text).toContain("TOTALPAY");
    expect(text).toContain("TKF-2601-AB34");
    expect(text).toContain("BaridiMob");
    expect(text).toContain("YacineB.");
    expect(text).toContain("3800DA");
  });
});
