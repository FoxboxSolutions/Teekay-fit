/**
 * Numéro WhatsApp et génération de liens wa.me (canal principal, PRD §7).
 * Numéro lue dans NEXT_PUBLIC_WHATSAPP_NUMBER au format international +213….
 * Si absente ou invalide, les boutons WhatsApp sont masqués (jamais de faux numéro).
 */

export const WA_PATTERN = /^\+213\d{9}$/;

/** Normalise (espaces/tirets retirés) et valide le numéro. Retourne null si absent/incorrect. */
export function getWhatsAppNumber(): string | null {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!raw) return null;
  const normalized = raw.replace(/[\s-]/g, "");
  return WA_PATTERN.test(normalized) ? normalized : null;
}

export function hasWhatsAppNumber(): boolean {
  return getWhatsAppNumber() !== null;
}

/** Lien wa.me avec message pré-rempli. Retourne null si le numéro est absent/incorrect. */
export function waLink(message: string): string | null {
  const number = getWhatsAppNumber();
  if (!number) return null;
  const digits = number.replace(/^\+/, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
