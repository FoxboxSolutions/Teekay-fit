/**
 * RFC 6238 TOTP (SHA-1, 6 chiffres, pas 30 s) — utilisé uniquement par les
 * tests M7a pour piloter un enroll/challenge/verify TOTP Supabase local.
 * (Aucune dépendance : HMAC-SHA1 via node:crypto.)
 */
import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
 const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("base32 invalide");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Code TOTP courant (à ±window pas près : utile si la fenêtre tourne). */
export function totp(secretBase32: string, atMs: number = Date.now(), step = 30, digits = 6): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! << 16) & 0xff0000) |
    ((digest[offset + 2]! << 8) & 0xff00) |
    (digest[offset + 3]! & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}
