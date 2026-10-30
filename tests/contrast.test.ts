import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  palette,
  contrast,
  textPairs,
  forbiddenTextPairs,
  nonTextPairs,
} from "../src/lib/design-system/palette";

const css = readFileSync(
  join(__dirname, "..", "src", "app", "globals.css"),
  "utf8",
);

function cssColorTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(
    /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g,
  )) {
    const [, name, hex] = match;
    if (name && hex) tokens[name] = hex.toLowerCase();
  }
  return tokens;
}

function ratioOf(pair: { fg: keyof typeof palette; bg: keyof typeof palette }) {
  return contrast(palette[pair.fg], palette[pair.bg]);
}

describe("Design system — tokens (globals.css = source unique)", () => {
  const tokens = cssColorTokens();

  it("chaque couleur de la palette est déclarée en token --color-*", () => {
    for (const [name, hex] of Object.entries(palette)) {
      expect(tokens[name], `token --color-${name} manquant`).toBe(hex);
    }
  });

  it("aucun token --color-* hors palette (pas de dérive)", () => {
    const known = new Set(Object.keys(palette));
    const rogue = Object.keys(tokens).filter((name) => !known.has(name));
    expect(rogue, "tokens inconnus").toEqual([]);
  });

  it("définit les tokens de rayon, ombre, durée et familles", () => {
    expect(css).toMatch(/--radius-control:/);
    expect(css).toMatch(/--radius-card:/);
    expect(css).toMatch(/--radius-pill:/);
    expect(css).toMatch(/--shadow-card:/);
    expect(css).toMatch(/--shadow-pop:/);
    expect(css).toMatch(/--duration-fast:/);
    expect(css).toMatch(/--duration-base:/);
    expect(css).toMatch(/--duration-slow:/);
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/--font-sans:/);
    expect(css).toMatch(/--font-arabic:/);
  });

  it("respecte prefers-reduced-motion", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe("Contrastes texte — ≥ 4,5:1 (WCAG 2.1 AA)", () => {
  for (const pair of textPairs) {
    it(`${pair.fg} sur ${pair.bg} ≥ 4,5:1 — ${pair.rule}`, () => {
      const ratio = ratioOf(pair);
      expect(
        Number(ratio.toFixed(2)),
        `${palette[pair.fg]} sur ${palette[pair.bg]}`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }
});

describe("Paires interdites — confirmées < 4,5:1", () => {
  for (const pair of forbiddenTextPairs) {
    it(`${pair.fg} sur ${pair.bg} reste sous 4,5:1 — ${pair.rule}`, () => {
      const ratio = ratioOf(pair);
      expect(
        Number(ratio.toFixed(2)),
        `${palette[pair.fg]} sur ${palette[pair.bg]}`,
      ).toBeLessThan(pair.min);
    });
  }
});

describe("Éléments non textuels — ≥ 3:1", () => {
  for (const pair of nonTextPairs) {
    it(`${pair.fg} sur ${pair.bg} ≥ 3:1 — ${pair.rule}`, () => {
      const ratio = ratioOf(pair);
      expect(
        Number(ratio.toFixed(2)),
        `${palette[pair.fg]} sur ${palette[pair.bg]}`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }
});
