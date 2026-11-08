import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * M8 — PRD §14 : « Ne jamais stocker de données de carte, PIN, OTP ou
 * identifiants bancaires. »
 *
 * Les migrations sont la source de vérité du schéma : ce test les parse
 * (blocs `create table` + `add column`) et échoue si une colonne porte un
 * nom de carte, de cryptogramme, de PIN, d'OTP ou d'identifiant bancaire.
 * Seules les DÉFINITIONS de colonnes sont examinées — les valeurs de
 * configuration (ex. clés `baridimob.account` dans `site_settings`) ne
 * sont pas des colonnes et ne comptent pas.
 */

const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

/** Sous-mots interdits (PRD §14) dans un nom de colonne. */
const FORBIDDEN = [
  "card",
  "cvv",
  "cvc",
  "iban",
  "swift",
  "bic",
  "rib",
  "pin",
  "otp",
  "account_number",
  "routing",
  "bank_account",
  "bank_code",
];

/** Types SQL usuels du projet : sert à repérer une définition de colonne. */
const COLUMN_TYPE =
  "(?:text|uuid|timestamptz|timestamp|date|time|integer|bigint|smallint|boolean|numeric|jsonb?|bytea|varchar\\s*\\(\\s*\\d+\\s*\\)|char\\s*\\(\\s*\\d+\\s*\\)|double\\s+precision|real|interval)";

/** Noms de colonnes détectés dans toutes les migrations. */
function columnNames(): string[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const names: string[] = [];

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");

    // Blocs create table : contenu entre parenthèses équilibrées.
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?[\w."]+\s*\(/gi;
    for (const m of sql.matchAll(createRe)) {
      let depth = 1;
      let i = (m.index ?? 0) + m[0].length;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "(") depth += 1;
        else if (sql[i] === ")") depth -= 1;
        i += 1;
      }
      const block = sql.slice((m.index ?? 0) + m[0].length, i - 1);
      const colRe = new RegExp(`^\\s*([a-z][a-z0-9_]*)\\s+${COLUMN_TYPE}\\b`, "gmi");
      for (const c of block.matchAll(colRe)) names.push(c[1] as string);
    }

    // alter table ... add column <nom>
    const addRe =
      /alter\s+table\s+[\w."]+\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z][a-z0-9_]*)/gi;
    for (const c of sql.matchAll(addRe)) names.push(c[1] as string);
  }

  return names;
}

describe("M8 — PRD §14 : aucune donnée de carte, PIN, OTP ou identifiant bancaire stockée", () => {
  it("TEST NOMMÉ : le parseur couvre réellement le schéma (tables et colonnes détectées, contrôle non vide)", () => {
    const names = columnNames();
    // Garde contre un test « vide » qui passerait sans rien vérifier.
    expect(names.length).toBeGreaterThan(100);
    expect(names).toContain("email");
    expect(names).toContain("reference");
    expect(names).toContain("status");
  });

  it("TEST NOMMÉ : aucune colonne du schéma ne porte un nom de carte, PIN, OTP ou identifiant bancaire", () => {
    const offenders = columnNames().filter((name) => {
      const lower = name.toLowerCase();
      return FORBIDDEN.some((s) => lower.includes(s));
    });
    expect(offenders, `colonnes interdites PRD §14 : ${offenders.join(", ")}`).toEqual([]);
  });
});
