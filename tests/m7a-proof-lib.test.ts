import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  detectImageMime,
  isValidTransactionReference,
  repackProofImage,
} from "@/lib/payments/proof";

/**
 * M7a bloc 2 — lib capture de preuve :
 *  - type accepté UNIQUEMENT par magie du fichier (jpeg/png/webp), nil par
 *    déclaration du client ;
 *  - ré-encodage webp : EXIF et toutes métadonnées PARTIS (orientation
 *    cuite dans les pixels), taille limitée en amont par la route ;
 *  - la ré-encode génère un buffer réel de taille > 0.
 */

async function pngWithExif(): Promise<Buffer> {
  const base = await sharp({
    create: { width: 18, height: 18, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  // Injecte de l'EXIF réel (commentaire) pour prouver qu'il disparaît après ré-encodage.
  return (await sharp(base).withExif({ IFD0: { ImageDescription: "exif-copy-marker" } }).png().toBuffer()) as Buffer;
}

describe("detectImageMime — magie, jamais le ContentType", () => {
  it("jpeg/png/webp reconnus par signature ; tout autre buffer refusé", async () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(16, 1),
    ]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4, 0),
      Buffer.from("WEBP"),
      Buffer.alloc(8, 2),
    ]);
    const fake = Buffer.alloc(32, 0x41); // "AAAA..." texte qui se déclarerait image/jpeg

    expect(detectImageMime(jpeg)).toBe("image/jpeg");
    expect(detectImageMime(png)).toBe("image/png");
    expect(detectImageMime(webp)).toBe("image/webp");
    expect(detectImageMime(fake)).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
  });

  it("tête négative : un .exe/.pdf renommé .jpg est refusé (type réellement honnête)", () => {
    const pdf = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(16, 0)]);
    expect(detectImageMime(pdf)).toBeNull();
  });
});

describe("repackProofImage — ré-encodage, EXIF jamais conservé", () => {
  it("le webp de sortie ne contient AUCUN marqueur EXIF d'entrée", async () => {
    const src = await pngWithExif();
    const before = await sharp(src).metadata();
    expect(before.exif).toBeTruthy();

    const { webp, bytes } = await repackProofImage(src);
    expect(bytes).toBeGreaterThan(50);
    const after = await sharp(webp).metadata();
    expect(after.format).toBe("webp");
    expect(after.exif ?? null).toBeNull();
    // Aucun fragment de la chaîne EXIF d'origine dans les octets du résultat.
    expect(webp.toString("latin1")).not.toContain("ImageDescription");
  });

  it("pixel identique : le repack ne corrompt pas l'image (18×18 d'entrée ⇒ 18×18 de sortie)", async () => {
    const src = await pngWithExif();
    const { webp } = await repackProofImage(src);
    const after = await sharp(webp).metadata();
    expect(after.width).toBe(18);
    expect(after.height).toBe(18);
  });
});

describe("isValidTransactionReference — format validé (frappe humaine)", () => {
  it("accepte alphanumérique + tiret, 6–60 ; refuse vide, trop court, caractères interdits", () => {
    expect(isValidTransactionReference("7123456789ABC")).toBe(true);
    expect(isValidTransactionReference("ref-2026-0012")).toBe(true);
    expect(isValidTransactionReference("A1B2C3")).toBe(true);
    for (const bad of [
      "",
      "abc12", // trop court
      "abc 12",
      "référence#1",
      "a".repeat(61),
      "-leading", // premier caractère non alphanumérique
      "aé12",
      "aé buena",
    ]) {
      expect(isValidTransactionReference(bad)).toBe(false);
    }
  });
});
