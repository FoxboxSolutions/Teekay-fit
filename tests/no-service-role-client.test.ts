import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

/**
 * Règle M2 : la clé service-role ne doit jamais être référencée dans du code
 * côté client. Toute violation = test échouant (contrainte PRD §15).
 */

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

// Modules autorisés à toucher à la clé service-role (côté serveur uniquement).
const SERVER_ONLY_ALLOWLIST = [
  "src/lib/supabase/admin.ts", // déclaration server-only du client admin
];

// Chemins exclus de l'analyse (ces dossiers ne sont jamais embarqués client).
const EXCLUDED_DIRS = ["node_modules", ".next", ".git", "supabase", "dist", "coverage"];
const INCLUDED_EXT = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRS.includes(entry)) walk(full, files);
    } else if (INCLUDED_EXT.includes(path.extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(ROOT);

describe("sécurité — la clé service-role n'est jamais côté client", () => {
  it("aucun fichier client ne référence SUPABASE_SERVICE_ROLE_KEY", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");

      // Fichiers explicitement côté serveur : autorisés.
      if (SERVER_ONLY_ALLOWLIST.includes(rel)) continue;
      if (rel.startsWith("tests/")) continue;

      const content = readFileSync(file, "utf8");
      if (!/SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/.test(content)) continue;

      // Détection client : fichier sous app/ avec directive "use client",
      // ou importé depuis le sous-arbre client.
      const isClientFile =
        content.includes('"use client"') || content.includes("'use client'");
      // Un fichier qui importe browser.ts côté client est un signal aussi.
      const importsBrowser = content.includes("lib/supabase/browser");

      if (isClientFile || importsBrowser) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("le client admin porte la déclaration server-only", () => {
    const adminPath = path.join(ROOT, "src/lib/supabase/admin.ts");
    const content = readFileSync(adminPath, "utf8");
    expect(content).toContain('import "server-only"');
    expect(content).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("aucune variable NEXT_PUBLIC_* ne contient une clé secrète", () => {
    const envExample = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    const publicLines = envExample
      .split("\n")
      .filter((line) => line.startsWith("NEXT_PUBLIC_"));
    for (const line of publicLines) {
      expect(line).not.toMatch(/SECRET|SERVICE_ROLE|PRIVATE/i);
    }
  });
});
