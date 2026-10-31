/**
 * Normalisation des numéros de téléphone algériens en E.164 (+213…).
 *
 * Utilisée pour la détection de doublons de leads (colonne `phone_norm`,
 * index unique partiel). Un numéro invalide → `null` (aucun lead créé).
 *
 * Mobile algérien : indicatif +213, numéro national à 9 chiffres commençant
 * par 5, 6 ou 7 (fixe excluded — le canal est WhatsApp/mobile).
 */

const DZ_MOBILE = /^[5-7]\d{8}$/;

/**
 * Normalise en `+213XXXXXXXXX` (E.164) ou retourne `null` si invalide.
 *
 * Formats acceptés (exemples) :
 *   « +213 555 00 00 00 » → +213555000000
 *   « 0555000000 »        → +213555000000
 *   « 213555000000 »      → +213555000000
 *   « 555000000 »         → +213555000000
 *   « 00213555000000 »    → +213555000000
 *
 * Invalides → `null` : lettre, trop court, fixe, mauvais pays, vide.
 */
export function normalizePhoneE164(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // N'accepte que chiffres et séparateurs (+, espaces, tirets, points, parenthèses).
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;

  let digits = trimmed.replace(/[\s().-]/g, "");
  // « 00 » = préfixe international.
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) digits = `+${digits}`;
  if (!/^\+\d+$/.test(digits)) return null;

  let national = digits.slice(1); // sans « + »
  // Retire l'indicatif pays 213 (avec éventuel « 0 » national).
  if (national.startsWith("213")) {
    let rest = national.slice(3);
    if (rest.startsWith("0")) rest = rest.slice(1);
    national = rest;
  } else if (national.startsWith("0")) {
    national = national.slice(1);
  }

  if (!DZ_MOBILE.test(national)) return null;
  return `+213${national}`;
}

/** Vrai si la chaîne est normalisable en un numéro mobile algérien valide. */
export function isValidDZPhone(input: unknown): boolean {
  return normalizePhoneE164(input) !== null;
}
