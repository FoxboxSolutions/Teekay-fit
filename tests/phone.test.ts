import { describe, it, expect } from "vitest";
import { normalizePhoneE164, isValidDZPhone } from "@/lib/phone";

describe("normalizePhoneE164 — table de cas", () => {
  const valid: Array<[string, string]> = [
    ["+213 555 00 00 00", "+213555000000"],
    ["+213555000000", "+213555000000"],
    ["0555000000", "+213555000000"],
    ["213555000000", "+213555000000"],
    ["555000000", "+213555000000"],
    ["00213555000000", "+213555000000"],
    ["+213 0555 000 000", "+213555000000"],
    // Autres mobiles : 6xx, 7xx.
    ["0612345678", "+213612345678"],
    ["+213771234567", "+213771234567"],
    ["  +213-555.000.000  ", "+213555000000"],
  ];

  it.each(valid)("accepte %s → %s", (input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  const invalid: unknown[] = [
    "", // vide
    "   ", // blanc
    "abc", // lettres
    "0555", // trop court
    "055500000", // 8 chiffres nationaux (9 total)
    "+213212345678", // fixe (2…), pas mobile
    "+33 6 12 34 56 78", // autre pays
    "+15550000000", // USA
    "+213", // que l'indicatif
    "2135", // incomplet
    null,
    undefined,
    555000000, // nombre, pas chaîne
    "+2135550000000", // 10 chiffres nationaux
  ];

  it.each(invalid)("refuse %s → null", (input) => {
    expect(normalizePhoneE164(input)).toBeNull();
  });
});

describe("isValidDZPhone", () => {
  it("true pour un mobile valide", () => {
    expect(isValidDZPhone("+213555000000")).toBe(true);
    expect(isValidDZPhone("0555000000")).toBe(true);
  });
  it("false pour invalide", () => {
    expect(isValidDZPhone("0555")).toBe(false);
    expect(isValidDZPhone("+15550000000")).toBe(false);
    expect(isValidDZPhone(null)).toBe(false);
  });
});
