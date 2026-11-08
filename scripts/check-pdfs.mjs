#!/usr/bin/env node
/**
 * Garde PDF (M8 bloc 5) : aucun PDF tracké dans le dépôt hors
 * `tests/fixtures/`.
 *
 * Raison : les PDF des offres (Starter) sont des contenus livrés après
 * paiement — ils vivent dans le bucket PRIVÉ `offer-files`, jamais dans
 * Git. `.gitignore` refuse déjà `*.pdf` (sauf `tests/fixtures/`) ; cette
 * garde échoue en CI si un PDF a été ajouté de force (`git add -f`).
 *
 * Modes :
 *  - défaut (npm run check:pdfs, CI) : échoue (exit 1) s'il reste un PDF
 *    tracké hors fixtures ;
 *  - importé par tests/m8-offer-files-depot.test.ts (logique testée sur
 *    des listes de chemins simulées).
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Seul dossier autorisé à contenir des PDF trackés. */
export const FIXTURES_DIR = "tests/fixtures/";

/**
 * Sous-ensemble des chemins trackés qui enfreint la règle.
 * @param {string[]} paths
 * @returns {string[]}
 */
export function strayPdfs(paths) {
  return paths.filter((file) => !file.startsWith(FIXTURES_DIR));
}

/**
 * PDF trackés par git (pathspec `*.pdf`, à n'importe quelle profondeur).
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function listTrackedPdfs(cwd = ROOT) {
  const out = execFileSync("git", ["ls-files", "-z", "--", "*.pdf"], {
    cwd,
    encoding: "utf8",
  });
  return out.split("\0").filter((file) => file.length > 0);
}

/**
 * Vérifie une liste de chemins fournie, ou l'arbre courant par défaut.
 * @param {{ cwd?: string, files?: string[] }} [options]
 * @returns {{ ok: boolean, stray: string[] }} `stray` = PDF hors `tests/fixtures/`.
 */
export function runCheck({ cwd = ROOT, files } = {}) {
  const stray = strayPdfs(files ?? listTrackedPdfs(cwd));
  return { ok: stray.length === 0, stray };
}

function main() {
  const res = runCheck();
  if (!res.ok) {
    console.error(`✗ PDF tracké hors ${FIXTURES_DIR} — ${res.stray.length} fichier(s) :`);
    for (const file of res.stray) {
      console.error(`  • ${file}`);
    }
    console.error(
      `Les PDF des offres ne vont JAMAIS dans Git (bucket privé offer-files). ` +
        `Seules les fixtures de test sont autorisées sous ${FIXTURES_DIR}.`,
    );
    process.exit(1);
  }
  console.log(`✓ Aucun PDF tracké hors ${FIXTURES_DIR}.`);
}

// Exécuté directement (node scripts/…) mais pas importé par les tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
