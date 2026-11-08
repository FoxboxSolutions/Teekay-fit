import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";
import { runCheck as runPdfCheck, FIXTURES_DIR } from "../scripts/check-pdfs.mjs";

/**
 * M8 (bloc 5) — Dépôt des fichiers d'offres :
 *  - docs/offer-files-depot.md documente le dépôt manuel (upload
 *    service-role dans le bucket privé `offer-files` + ligne `offer_files`),
 *    l'interface d'upload repoussée en M9, et ne contient aucun secret ;
 *  - scripts/offer-files-insert.sql exécuté RÉELLEMENT sur la base
 *    locale : insert, rejeu idempotent (jamais de doublon), mise à jour du
 *    libellé, échec sur variable manquante, puis nettoyage ;
 *  - .gitignore : `*.pdf` refusé sauf `tests/fixtures/` (vérifié avec
 *    `git check-ignore` réel) ;
 *  - CI : étape qui échoue si un PDF est tracké hors fixtures
 *    (logique de scripts/check-pdfs.mjs testée sur listes simulées +
 *    arbre actuel vérifié).
 */

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DOC = "docs/offer-files-depot.md";
const SCRIPT = "scripts/offer-files-insert.sql";

const env = getLocalEnv();
const runId = `${Date.now()}`;
const STORAGE_PATH = `starter/depot-fixture-${runId}.pdf`;
const MISSING_PATH = `starter/depot-sans-variable-${runId}.pdf`;

// PATH Docker Windows (même convention que tests/helpers/env.ts) ; sur
// Linux les entrées supplémentaires sont inertes et docker est déjà dedans.
const DOCKER_ENV = {
  ...process.env,
  PATH: `${process.env.PATH};C:\\Program Files\\Docker\\Docker\\resources\\bin`,
};

let admin: SupabaseClient;
let offerId: string;
const createdFiles: string[] = [];
const createdOffers: string[] = [];

/** Nom du conteneur Postgres : projet lu dans supabase/config.toml. */
function dbContainer(): string {
  const config = readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!match?.[1]) throw new Error("project_id introuvable dans supabase/config.toml");
  return `supabase_db_${match[1]}`;
}

/** Exécute scripts/offer-files-insert.sql via psql (stdin), comme documenté. */
function runScript(args: {
  offerId: string;
  storagePath: string;
  label: string;
  omitOfferId?: boolean;
}): string {
  const psqlArgs = ["exec", "-i", dbContainer(), "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (!args.omitOfferId) psqlArgs.push("-v", `offer_id=${args.offerId}`);
  psqlArgs.push(
    "-v",
    `storage_path=${args.storagePath}`,
    "-v",
    `label=${args.label}`,
    "-f",
    "-",
  );
  return execFileSync("docker", psqlArgs, {
    input: readFileSync(path.join(ROOT, SCRIPT), "utf8"),
    encoding: "utf8",
    env: DOCKER_ENV,
  });
}

/** true = chemin ignoré par git (ne peut pas être committé tel quel). */
function gitCheckIgnored(file: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", file], { cwd: ROOT, encoding: "utf8" });
    return true;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return false;
    throw error;
  }
}

beforeAll(async () => {
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Offre éphémère : la ligne offer_files référencée par le script doit
  // pointer sur une offre réelle (FK) — créée puis supprimée après le test.
  const offer = await admin
    .from("offers")
    .insert({
      slug: `m8-depot-${runId}`,
      name: "Starter",
      offer_type: "starter",
      price_da: 2000,
      is_active: true,
    })
    .select("id")
    .single();
  expect(offer.error).toBeNull();
  offerId = (offer.data as { id: string }).id;
  createdOffers.push(offerId);
});

describe("M8 bloc 5 — dépôt des fichiers d'offres", () => {
  it("TEST NOMMÉ : le doc décrit le dépôt service-role dans le bucket privé offer-files + la ligne offer_files + l'upload en M9, sans aucun secret", () => {
    const doc = readFileSync(path.join(ROOT, DOC), "utf8");

    // Dépôt manuel documenté : bucket, objet, service-role, ligne SQL.
    expect(doc).toContain("offer-files");
    expect(doc).toContain("/storage/v1/object/offer-files/");
    expect(doc).toContain("service-role");
    expect(doc).toContain("offer_files");
    expect(doc).toContain("scripts/offer-files-insert.sql");
    expect(doc).toContain("x-upsert: true"); // remplacement d'un fichier
    // Interface d'upload admin = M9 (incohérence §21 n°7).
    expect(doc).toContain("M9");
    // La source n'est jamais servie telle quelle (filigrane à la volée).
    expect(doc).toMatch(/filigrane/i);
    // L'e-mail d'accès ne contient ni fichier ni lien de téléchargement.
    expect(doc).toContain("ni fichier ni lien de téléchargement");

    // Anti-fuite : aucun jeton ni identifiant dans le document.
    expect(doc).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(doc).not.toMatch(/password\s*[:=]/i);
  });

  it("TEST NOMMÉ : le script SQL exécuté réellement insère, rejoue SANS doublon et met à jour le libellé (upsert sur storage_path)", async () => {
    // 1re exécution : la ligne apparaît et la sortie confirme le chemin.
    const first = runScript({ offerId, storagePath: STORAGE_PATH, label: "Fixture depot" });
    expect(first).toContain(STORAGE_PATH);

    // Rejeu x2 (idempotence + mise à jour du libellé) : toujours UNE ligne.
    runScript({ offerId, storagePath: STORAGE_PATH, label: "Fixture depot" });
    runScript({ offerId, storagePath: STORAGE_PATH, label: "Libelle remplace" });

    const { data, error } = await admin
      .from("offer_files")
      .select("id,offer_id,storage_path,label,file_kind")
      .eq("storage_path", STORAGE_PATH);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1); // jamais de doublon

    const row = data?.[0];
    expect(row?.offer_id).toBe(offerId);
    expect(row?.storage_path).toBe(STORAGE_PATH);
    expect(row?.label).toBe("Libelle remplace"); // dernière exécution gagne
    expect(row?.file_kind).toBe("pdf");
    createdFiles.push(row?.id as string);
  });

  it("TEST NOMMÉ : variable psql manquante ⇒ le script échoue (exit non nul) au lieu d'insérer n'importe quoi", async () => {
    expect(() =>
      runScript({
        offerId,
        storagePath: MISSING_PATH,
        label: "Sans offre",
        omitOfferId: true,
      }),
    ).toThrow();

    // Aucune ligne créée par l'exécution en échec.
    const { data } = await admin
      .from("offer_files")
      .select("id")
      .eq("storage_path", MISSING_PATH);
    expect(data ?? []).toEqual([]);
  });

  it("TEST NOMMÉ : .gitignore refuse tout PDF hors tests/fixtures/ (vérifié avec git check-ignore réel)", () => {
    const rules = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    expect(rules).toContain("*.pdf");
    expect(rules).toContain("!tests/fixtures/**/*.pdf");

    // PDF hors fixtures : ignoré (impossible à committer sans force).
    expect(gitCheckIgnored("docs/programme-fuite.pdf")).toBe(true);
    expect(gitCheckIgnored("programme-fuite.pdf")).toBe(true);
    // PDF de fixtures : pas ignoré (seul dossier autorisé).
    expect(gitCheckIgnored(`${FIXTURES_DIR}programme.pdf`)).toBe(false);
    expect(gitCheckIgnored(`${FIXTURES_DIR}sous-dossier/programme.pdf`)).toBe(false);
  });

  it("TEST NOMMÉ : la CI échoue si un PDF est tracké hors fixtures (étape + logique de scripts/check-pdfs.mjs) ; arbre actuel propre", () => {
    const ci = readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("npm run check:pdfs");
    // Chaîne complète : CI → script npm → script de garde.
    const pkg = readFileSync(path.join(ROOT, "package.json"), "utf8");
    expect(pkg).toContain("\"check:pdfs\": \"node scripts/check-pdfs.mjs\"");

    // Logique de la garde : un PDF hors fixtures ⇒ échec, listé nominativement.
    const bad = runPdfCheck({ files: ["docs/fuite.pdf", `${FIXTURES_DIR}fixture.pdf`] });
    expect(bad.ok).toBe(false);
    expect(bad.stray).toEqual(["docs/fuite.pdf"]);
    const good = runPdfCheck({ files: [`${FIXTURES_DIR}fixture.pdf`] });
    expect(good.ok).toBe(true);
    expect(good.stray).toEqual([]);

    // Arbre réel : aucun PDF tracké hors fixtures ⇒ la garde CI passe.
    const current = runPdfCheck();
    expect(current.ok, `PDF trackés hors fixtures : ${current.stray.join(", ")}`).toBe(true);
    expect(current.stray).toEqual([]);
  });
});

afterAll(async () => {
  if (!admin) return;
  for (const file of createdFiles) {
    await admin.from("offer_files").delete().eq("id", file);
  }
  await admin.from("offer_files").delete().in("storage_path", [STORAGE_PATH, MISSING_PATH]);
  for (const offer of createdOffers) {
    await admin.from("offers").delete().eq("id", offer);
  }
});
