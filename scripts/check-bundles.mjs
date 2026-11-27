#!/usr/bin/env node
/**
 * Contrôle d'hygiène des bundles CLIENT (`.next/static`) : aucune URL de
 * développement (`http://localhost:3000`, `http://127.0.0.1:54321`, …) ne
 * doit être livrée en production.
 *
 * - `APP_ENV=development|preview` : simple avertissement (configuration de
 *   dev explicite), exit 0.
 * - tout le reste (dont `production` ou APP_ENV absent, défaut sûr) : exit 1
 *   si une URL locale est trouvée.
 *
 * Ne scanne QUE `.next/static` (actifs publics servis au navigateur). Les
 * fallbacks serveur (`http://localhost:3000`) restent locaux et ne sont
 * jamais exposés au client.
 *
 * NOTE : les bibliothèques de parsing d'URL embarquées contiennent parfois
 * le littéral générique `"localhost"` (ex. `"localhost"===host` dans un
 * parser WHATWG). Ce n'est PAS une URL de notre application : ces
 * occurrences nues sont comptées en information, seules les formes
 * URL (schéma, `//`, ou `host:port`) déclenchent l'échec.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const STATIC_DIR = join(ROOT, ".next", "static");

/** Formes réellement URL : schéma, protocole-relatif, ou host:port. */
const URL_PATTERNS = [
  /(?:https?:)?\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#"']|$)/gi,
  /\b(?:localhost|127\.0\.0\.1):\d+\b/g,
];
/** Occurrence nue, pour information uniquement (parser WHATWG tiers). */
const BARE_HOST = /\b(?:localhost|127\.0\.0\.1)\b/g;

const EXTENSIONS = new Set([".js", ".css", ".map"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      out.push(...walk(full));
    } else if ([...EXTENSIONS].some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

let files;
try {
  files = walk(STATIC_DIR);
} catch {
  console.error(`ERREUR: ${relative(ROOT, STATIC_DIR)} absent — lancer "npm run build" d'abord.`);
  process.exit(1);
}

const urlHits = [];
let bareHostCount = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const pattern of URL_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      urlHits.push({ file: rel, value: match[0] });
    }
  }
  BARE_HOST.lastIndex = 0;
  bareHostCount += (text.match(BARE_HOST) ?? []).length;
}

if (bareHostCount > 0) {
  console.log(
    `INFO: ${bareHostCount} mention(s) nue(s) de localhost/127.0.0.1 dans des formes d'URL génériques de bibliothèque (non bloquantes).`,
  );
}

const appEnv = process.env.APP_ENV;
const isDev = appEnv === "development" || appEnv === "preview";

if (urlHits.length === 0) {
  console.log(`OK: ${files.length} fichiers client, aucune URL locale (127.0.0.1 / localhost).`);
  process.exit(0);
}

for (const hit of urlHits) {
  console.error(`URL locale dans un bundle: ${hit.file} → ${hit.value}`);
}

if (isDev) {
  console.warn(
    `AVERTISSEMENT: ${urlHits.length} URL(s) locale(s) tolérée(s) car APP_ENV=${appEnv} (dev explicite).`,
  );
  process.exit(0);
}

console.error(
  `ECHEC: ${urlHits.length} URL(s) locale(s) dans .next/static (APP_ENV=${appEnv ?? "absent"}).`,
);
process.exit(1);
