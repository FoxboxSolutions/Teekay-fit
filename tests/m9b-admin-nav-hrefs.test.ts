import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M9b (d) — navigation admin : GARDE-FOU statique.
 *
 * Défaut mesuré (M9a) : les hrefs relatifs du dashboard (« ./a-traiter »,
 * « ./paiements »…) se résolvaient depuis /fr/admin en /fr/a-traiter etc.
 * = 404, et un « /fr/admin/mfa » était codé en dur dans un composant admin
 * (incompatible avec la préparation RTL, Phase 2b).
 *
 * Ce test échoue si UN fichier sous src/app/[locale]/admin/** ou
 * src/components/admin/** contient :
 *   - un href relatif commençant par « ./ » (href="./…", href='./…',
 *     href={`./…`) ;
 *   - un « /fr/ » codé en dur (dans des quotes simples, doubles ou
 *     backticks).
 *
 * Exemptions documentées (légitimes, non signalées) :
 *   - `a.href = url` (URL blob locale, mfa-panel : téléchargement des codes
 *     de secours) — pas un littéral ;
 *   - hrefs de requête relative (`?customer=…`, mergeSearchParams) —
 *     résolus contre l'URL courante, pas de préfixe ;
 *   - `/${locale}/admin/…` — la locale vient du segment, rien en dur.
 */

const ROOTS = [
  path.join("src", "app", "[locale]", "admin"),
  path.join("src", "components", "admin"),
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("M9b (d) — aucun href relatif « ./ » ni « /fr/ » codé en dur dans l'admin", () => {
  it("aucun fichier admin ne contient href='./…' ni « /fr/ » littéral", () => {
    const offenders: string[] = [];
    let fileCount = 0;

    for (const root of ROOTS) {
      for (const file of listFiles(root)) {
        fileCount++;
        const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, idx) => {
          // href relatif : href="./…", href='./…', href={`./…}
          if (/href\s*=\s*["'`]\.\//.test(line)) {
            offenders.push(`${rel}:${idx + 1} — href relatif « ./ » : ${line.trim()}`);
          }
          // « /fr/ » codé en dur entre quotes (simple, double, backtick).
          if (/["'`]\/fr\//.test(line)) {
            offenders.push(`${rel}:${idx + 1} — « /fr/ » codé en dur : ${line.trim()}`);
          }
        });
      }
    }

    expect(fileCount, "aucun fichier analysé (périmètre introuvable)").toBeGreaterThan(0);
    expect(
      offenders,
      `hrefs admin non conformes (${offenders.length}) :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
