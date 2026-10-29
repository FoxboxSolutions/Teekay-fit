import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "src");

const FORBIDDEN = [
  /\bml-/,
  /\bmr-/,
  /\bpl-/,
  /\bpr-/,
  /\bleft-/,
  /\bright-/,
  /\bfloat-left\b/,
  /\bfloat-right\b/,
  /\btext-left\b/,
  /\btext-right\b/,
  /\brounded-l\b/,
  /\brounded-r\b/,
  /\bborder-l\b/,
  /\bborder-r\b/,
  /margin-left/,
  /margin-right/,
  /padding-left/,
  /padding-right/,
  /border-left/,
  /border-right/,
  /text-align:\s*left/,
  /text-align:\s*right/,
  /:\s*left\s*;/,
  /:\s*right\s*;/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(tsx?|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("RTL — propriétés CSS logiques uniquement", () => {
  const files = walk(SRC);

  it("trouve des fichiers source à scanner", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.replace(SRC, "src");
    it(`${rel} ne contient aucune propriété physique (ml-, mr-, pl-, pr-, left-, right-…)`, () => {
      const content = readFileSync(file, "utf8");
      const violations: string[] = [];
      for (const pattern of FORBIDDEN) {
        const match = content.match(new RegExp(pattern, "g"));
        if (match) {
          violations.push(`${pattern.source}: ${match.join(", ")}`);
        }
      }
      expect(violations, `Utilise les utilitaires logiques (ms-, me-, ps-, pe-, start-, end-, text-start/end)`).toEqual([]);
    });
  }
});
