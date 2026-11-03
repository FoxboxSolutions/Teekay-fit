import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Captures de preuve de paiement (M7a) — serveur UNIQUEMENT (client via
 * /api/orders/[reference]/proof avec jeton de statut).
 *
 * Garde-fous : seuls les types jpeg/png/webp acceptés (VÉRIFIÉS PAR MAGIE
 * DU FICHIER, pas par le Content-Type envoyé), taille limitée, EXIF et
 * toutes métadonnées retirés par RÉ-ENCODAGE (sharp, jamais conservés),
 * nom regénéré (uuid), stockage dans le bucket PRIVÉ `payment-proofs` ;
 * lecture admin via URL signée COURT seulement, créée côté serveur.
 */

export const PROOF_BUCKET = "payment-proofs";
export const PROOF_MAX_INPUT_BYTES = 8 * 1024 * 1024; // limite avant ré-encodage
const SIGNED_URL_TTL_SECONDS = 300; // lien signé court pour l'admin

/** Types acceptés, détectés par la signature du fichier. */
export type ProofMime = "image/jpeg" | "image/png" | "image/webp";

export function detectImageMime(head: Uint8Array): ProofMime | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return "image/png";
  }
  if (head.length >= 12) {
    const riff =
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    const webp =
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    if (riff && webp) return "image/webp";
  }
  return null;
}

/**
 * Ré-encodage webp : l'orientation EXIF est cuite dans les pixels (.rotate()
 * sans angle applique l'orientation) — aucune métadonnée d'origine n'est
 * conservée (EXIF inclus) : un ré-encodage, jamais un simple retrait de
 * balises. Retourne (buffer, taille réelle).
 */
export async function repackProofImage(
  input: Buffer,
): Promise<{ webp: Buffer; bytes: number }> {
  const webp = await sharp(input).rotate().webp({ quality: 82 }).toBuffer();
  return { webp, bytes: webp.byteLength };
}

/** Upload dans le bucket PRIVÉ : chemin regénéré, jamais fourni par le client. */
export async function uploadProofImage(
  orderId: string,
  webp: Buffer,
): Promise<{ objectPath: string; sizeBytes: number }> {
  const objectPath = `${orderId}/${randomUUID()}.webp`;
  const { error } = await createSupabaseAdminClient()
    .storage.from(PROOF_BUCKET)
    .upload(objectPath, webp, { contentType: "image/webp", cacheControl: "3600" });
  if (error) throw error; // la route traduit en réponse neutre
  return { objectPath, sizeBytes: webp.byteLength };
}

/** Lien signé COURT pour la lecture admin (300 s) — jamais d'URL publique. */
export async function createAdminProofSignedUrl(
  objectPath: string,
): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(PROOF_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Format de référence de transaction (frappe humaine validée). */
export function isValidTransactionReference(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{5,59}$/.test(value);
}
