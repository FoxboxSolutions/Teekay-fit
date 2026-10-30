/**
 * Design system « luxury red & black » — palette canonique partagée entre
 * `src/app/globals.css` (tokens `--color-*`) et les tests.
 * `tests/contrast.test.ts` vérifie que les deux sources restent identiques.
 */

export const palette = {
  canvas: "#0a0a0a",
  surface: "#121212",
  "surface-raised": "#1a1a1a",
  line: "#2a2a2a",
  "line-input": "#666666",
  ink: "#f2efea",
  "ink-muted": "#a8a29e",
  "red-lux": "#a6111b",
  "red-bright": "#e8323b",
  "red-text": "#f6323b",
  wine: "#7a0c13",
} as const;

export type PaletteToken = keyof typeof palette;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Ratio de contraste WCAG 2.1 : (L1 + 0,05) / (L2 + 0,05), ordre indifférent. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export interface Pair {
  fg: PaletteToken;
  bg: PaletteToken;
  /** Ratio minimum requis (4,5 texte / 3 non textuel). */
  min: number;
  /** Règle métier associée, affichée en cas d'échec. */
  rule: string;
}

/** Couples texte/fond AUTORISÉS — doivent tous atteindre ≥ 4,5:1. */
export const textPairs: readonly Pair[] = [
  { fg: "ink", bg: "canvas", min: 4.5, rule: "texte principal sur fond" },
  { fg: "ink", bg: "surface", min: 4.5, rule: "texte principal sur surface" },
  {
    fg: "ink",
    bg: "surface-raised",
    min: 4.5,
    rule: "texte principal sur surface relevée",
  },
  {
    fg: "ink-muted",
    bg: "canvas",
    min: 4.5,
    rule: "texte secondaire sur fond",
  },
  {
    fg: "ink-muted",
    bg: "surface",
    min: 4.5,
    rule: "texte secondaire sur surface",
  },
  {
    fg: "ink-muted",
    bg: "surface-raised",
    min: 4.5,
    rule: "texte secondaire sur surface relevée",
  },
  { fg: "ink", bg: "red-lux", min: 4.5, rule: "libellé de bouton primaire" },
  { fg: "ink", bg: "wine", min: 4.5, rule: "libellé de bouton au survol" },
  { fg: "red-text", bg: "canvas", min: 4.5, rule: "texte rouge sur fond" },
  { fg: "red-text", bg: "surface", min: 4.5, rule: "texte rouge sur surface" },
  {
    fg: "red-text",
    bg: "surface-raised",
    min: 4.5,
    rule: "texte rouge sur surface relevée",
  },
  {
    fg: "red-bright",
    bg: "canvas",
    min: 4.5,
    rule: "seul cas de texte rouge vif autorisé (sur fond)",
  },
];

/** Couples INTERDITS — confirmés < 4,5:1 par calcul (documentés, jamais utilisés). */
export const forbiddenTextPairs: readonly Pair[] = [
  {
    fg: "red-lux",
    bg: "canvas",
    min: 4.5,
    rule: "interdit : #A6111B en texte sur fond noir",
  },
  {
    fg: "red-bright",
    bg: "surface",
    min: 4.5,
    rule: "interdit : texte rouge vif sur surface → utiliser #F6323B",
  },
  {
    fg: "red-bright",
    bg: "surface-raised",
    min: 4.5,
    rule: "interdit : texte rouge vif sur surface relevée → utiliser #F6323B",
  },
  {
    fg: "red-text",
    bg: "red-lux",
    min: 4.5,
    rule: "interdit : texte rouge sur fond rouge",
  },
  {
    fg: "red-bright",
    bg: "red-lux",
    min: 4.5,
    rule: "interdit : texte rouge sur fond rouge",
  },
];

/** Éléments NON textuels (icônes, filets, anneaux de focus, bordures de champs) — ≥ 3:1. */
export const nonTextPairs: readonly Pair[] = [
  { fg: "red-bright", bg: "canvas", min: 3, rule: "filet / icône rouge sur fond" },
  { fg: "red-bright", bg: "surface", min: 3, rule: "filet / icône rouge sur surface" },
  {
    fg: "red-bright",
    bg: "surface-raised",
    min: 3,
    rule: "filet / icône rouge sur surface relevée",
  },
  { fg: "red-text", bg: "canvas", min: 3, rule: "anneau de focus sur fond" },
  { fg: "red-text", bg: "surface", min: 3, rule: "anneau de focus sur surface" },
  {
    fg: "red-text",
    bg: "surface-raised",
    min: 3,
    rule: "anneau de focus sur surface relevée",
  },
  {
    fg: "line-input",
    bg: "canvas",
    min: 3,
    rule: "bordure de champ sur fond",
  },
  {
    fg: "line-input",
    bg: "surface",
    min: 3,
    rule: "bordure de champ sur surface",
  },
  {
    fg: "line-input",
    bg: "surface-raised",
    min: 3,
    rule: "bordure de champ sur surface relevée",
  },
];
