import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Global setup E2E (correction demandée avant M9) — remplace TOUTES les
 * purges manuelles des runs Playwright par un `supabase db reset` :
 *
 *  - les migrations sont rejouées sur la base LOCALE : toute la donnée du
 *    run précédent disparaît (comptes, commandes, `offer_files`,
 *    `rate_limit_counters`, outbox…) — y compris les reliquats append-only
 *    (`audit_logs`, `payment_transitions`) qui rendaient le nettoyage
 *    best-effort impossible à finaliser ;
 *  - il n'existe AUCUN chemin de suppression applicatif sur `audit_logs` ni
 *    sur `payment_transitions` : les invariants (M2/M6) sont conservés — un
 *    reset de base de développement locale n'est pas un chemin applicatif ;
 *  - FAIL CLOSED : le setup REFUSE de tourner si l'URL Supabase n'est pas
 *    locale (127.0.0.1 / localhost / ::1) — un `db reset` jamais lancé
 *    contre une base distante.
 */

/** Chemin du sink JSONL du CaptureMailer — partagé avec playwright.config. */
export const MAILER_CAPTURE_PATH = "test-results/mailer-capture.ndjson";

/**
 * Refuse toute URL non locale : hostname doit être exactement 127.0.0.1,
 * localhost ou ::1 (facultatif : port et protocole quelconques). Une URL
 * manquante ou non parsable = refus aussi (fail closed).
 */
export function assertLocalSupabaseUrl(url: string | null | undefined): void {
  let host = "";
  if (url) {
    try {
      host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    } catch {
      host = url; // non parsable ⇒ refuse
    }
  }
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!local) {
    throw new Error(
      `Global setup E2E refusé : Supabase doit être LOCAL (127.0.0.1/localhost) pour exécuter ` +
        `"supabase db reset". URL configurée : ${url ?? "(absente)"}`,
    );
  }
}

/** Lit NEXT_PUBLIC_SUPABASE_URL depuis process.env, sinon depuis `.env.local`. */
export function readSupabaseUrl(root: string, readFile = readFileSync): string | null {
  const fromProcess = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (fromProcess) return fromProcess;

  const envLocal = path.join(root, ".env.local");
  if (!existsSync(envLocal)) return null;
  const match = readFile(envLocal, "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m);
  if (!match?.[1]) return null;
  return match[1].trim().replace(/^["']|["']$/g, "") || null;
}

/**
 * 1. Vérifie que Supabase est LOCAL (sinon refus, avant toute action) ;
 * 2. tronque le JSONL de capture du Mailer (artefact de run, pas une purge
 *    de base : le reset DB ne le toucherait pas, et les specs anciennes
 *    s’appuient dessus) ;
 * 3. lance `supabase db reset` sur la base locale uniquement.
 */
export default function globalSetup(playwrightConfig?: unknown): void {
  // Playwright injecte son objet FullConfig en 1er argument — ignoré : la
  // racine du projet est le répertoire de travail du run (process.cwd()).
  void playwrightConfig;
  const root = process.cwd();
  const url = readSupabaseUrl(root);
  assertLocalSupabaseUrl(url);

  // Reste prudent : `db reset` passe par la CLI ; refus de principe le jour
  // où l'env pointerait ailleurs (double garde — hostname vérifié ci-dessus).
  process.stderr.write("[E2E globalSetup] base locale confirmée : db reset en cours…\n");

  const captureFile = path.join(root, MAILER_CAPTURE_PATH);
  if (existsSync(captureFile)) rmSync(captureFile, { force: true });

  execFileSync("npx supabase db reset", {
    cwd: root,
    shell: true,
    stdio: "inherit",
    timeout: 240_000,
  });
  process.stderr.write("[E2E globalSetup] db reset terminé.\n");
}
