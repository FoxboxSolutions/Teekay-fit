import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M9a (défaut 2) — garde-fou : toute clé i18n littérale utilisée par les
 * pages/composants admin et auth doit exister dans messages/fr.json.
 *
 * Périmètre : src/app/[locale]/admin/**, src/components/admin/**,
 *            src/app/[locale]/auth/** (fichiers .ts/.tsx).
 *
 * Analyse statique (limites connues, listées dans le rapport) :
 *  - espaces de noms résolus depuis useTranslations("ns"), getTranslations("ns")
 *    et getTranslations({ ..., namespace: "ns" }) ;
 *  - seuls les appels `t("clé")` (aussi t.rich / t.raw / t.markup) à argument
 *    littéral sont VÉRIFIÉS ;
 *  - les clés dynamiques (variable, expression, template avec interpolation)
 *    ne sont pas ignorées en silence : elles sont imprimées dans un tableau
 *    « clés non vérifiables » en sortie de test ;
 *  - le test échoue au PREMIER manque de clé.
 */

const ROOTS = [
  path.join("src", "app", "[locale]", "admin"),
  path.join("src", "components", "admin"),
  path.join("src", "app", "[locale]", "auth"),
];

type Checked = {
  file: string;
  line: number;
  ns: string;
  candidates: Array<{ ns: string; fullKey: string }>;
};
type Unverifiable = {
  file: string;
  line: number;
  call: string;
  reason: string;
};

/** Espace de noms déclaré par variable de traduction (plusieurs si re-déclarée). */
type NsByVar = Map<string, Set<string>>;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Déclarations : `const t = useTranslations("ns")` / `getTranslations({ namespace })`. */
function extractNamespaces(src: string): NsByVar {
  const byVar: NsByVar = new Map();
  const decl =
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(src)) !== null) {
    const varName = m[1];
    const args = m[2] ?? "";
    if (!varName) continue;
    const strArg = args.match(/^\s*["']([^"']+)["']/);
    const nsArg = args.match(/namespace\s*:\s*["']([^"']+)["']/);
    const ns = strArg?.[1] ?? nsArg?.[1];
    if (!byVar.has(varName)) byVar.set(varName, new Set());
    // ns undefined = useTranslations() sans espace de noms (clé racine complète).
    byVar.get(varName)?.add(ns ?? "");
  }
  return byVar;
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

function analyze(file: string, src: string): {
  checked: Checked[];
  unverifiable: Unverifiable[];
} {
  const byVar = extractNamespaces(src);
  const checked: Checked[] = [];
  const unverifiable: Unverifiable[] = [];

  for (const [varName, namespaces] of byVar) {
    const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Appel de la forme t(...) ou t.rich(...) — pas de point devant (évite foo.t()).
    const call = new RegExp(`(?<![\\w$.])${esc}\\s*(?:\\.\\s*\\w+)?\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = call.exec(src)) !== null) {
      const start = m.index + m[0].length;
      const arg = src.slice(start, start + 200);
      const line = lineOf(src, m.index);
      const shown = `${varName}(${(arg.split(/[,\n)]/)[0] ?? "").trim().slice(0, 60)})`;

      let key: string | null = null;
      let reason = "";
      const first = arg.trimStart()[0];
      if (first === '"' || first === "'") {
        const end = arg.indexOf(first, arg.trimStart().indexOf(first) + 1);
        key = arg.trimStart().slice(1, end === -1 ? undefined : end);
      } else if (first === "`") {
        const tmpl = arg.trimStart();
        const end = tmpl.indexOf("`", 1);
        const body = tmpl.slice(1, end === -1 ? undefined : end);
        if (body.includes("${")) reason = "template avec interpolation";
        else key = body;
      } else {
        reason = "argument non littéral (variable/expression)";
      }

      if (key !== null) {
        // Plusieurs espaces de noms possibles : la clé doit exister dans au moins l'un.
        const candidates = [...namespaces].map((ns) => ({
          ns: ns || "(racine)",
          fullKey: ns ? `${ns}.${key}` : key,
        }));
        checked.push({ file, line, ns: candidates.map((c) => c.ns).join(" | "), candidates });
      } else {
        unverifiable.push({ file, line, call: shown, reason });
      }
    }
  }
  return { checked, unverifiable };
}

describe("clés i18n admin/auth (M9a — garde-fou admin.leads.notAdmin & co)", () => {
  it("chaque clé littérale utilisée existe dans messages/fr.json", () => {
    const fr = JSON.parse(
      readFileSync(path.join("messages", "fr.json"), "utf8"),
    ) as Record<string, unknown>;

    const allChecked: Checked[] = [];
    const allUnverifiable: Unverifiable[] = [];

    let fileCount = 0;
    for (const root of ROOTS) {
      for (const file of listFiles(root)) {
        fileCount++;
        const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
        const { checked, unverifiable } = analyze(rel, readFileSync(file, "utf8"));
        allChecked.push(...checked);
        allUnverifiable.push(...unverifiable);
      }
    }

    // L'analyse ne doit jamais partir « silencieusement » dans le vide.
    expect(fileCount, "aucun fichier analysé (périmètre introuvable)").toBeGreaterThan(0);
    expect(allChecked.length, "aucune clé littérale détectée").toBeGreaterThan(0);

    // Tableau des clés non vérifiables : imprimé avant les assertions pour
    // rester visible même si le test échoue sur un manque.
    console.log(
      `\nClés non vérifiables par analyse statique (${allUnverifiable.length}) :`,
    );
    if (allUnverifiable.length > 0) {
      console.log(
        [
          "| fichier:ligne | appel | raison |",
          "|---|---|---|",
          ...allUnverifiable.map(
            (u) => `| ${u.file}:${u.line} | \`${u.call}\` | ${u.reason} |`,
          ),
        ].join("\n"),
      );
    } else {
      console.log("(aucune)");
    }
    console.log(`\nClés littérales vérifiées : ${allChecked.length}\n`);

    // Échec au premier manque : chaque clé doit résoudre une chaîne dans fr.json.
    for (const c of allChecked) {
      for (const cand of c.candidates) {
        const value = cand.fullKey
          .split(".")
          .reduce<unknown>(
            (acc, seg) =>
              acc && typeof acc === "object"
                ? (acc as Record<string, unknown>)[seg]
                : undefined,
            fr,
          );
        if (typeof value === "string") {
          // Au moins une variante résout : clé présente.
          break;
        }
        if (cand === c.candidates[c.candidates.length - 1]) {
          expect(
            typeof value,
            `${c.file}:${c.line} — clé manquante : « ${cand.fullKey} » (espace de noms « ${c.ns} »)`,
          ).toBe("string");
        }
      }
    }
  });
});
