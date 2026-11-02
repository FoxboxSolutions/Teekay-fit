#!/usr/bin/env node
/**
 * Contrôle des placeholders et de la maturité du contenu (M4).
 *
 * Modes :
 *  - défaut (dev / préprod)  : avertit, affiche le décompte, exit 0.
 *  - --strict (build:prod, CI) : échoue (exit 1) s'il reste une violation.
 *
 * Violations en mode strict :
 *  1. tout marqueur [À FOURNIR …] dans messages/*.json ;
 *  2. toute route déclarée « comingSoon » dans check-manifest.json
 *     (dont /checkout/[offre] tant que M6 n'est pas livré) ;
 *  3. toute page légale encore en placeholder (sous-ensemble explicite de 1) ;
 *  4. NEXT_PUBLIC_WHATSAPP_NUMBER absent ou hors format international (+213…) ;
 *  5. APP_ENV !== "production" (le build de production doit expliciter
 *      APP_ENV=production dans le shell — décision APP_ENV, audit M4).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const PLACEHOLDER_MARKER = "[À FOURNIR";
/** Format international algérien : +213 suivi de 9 chiffres nationaux. */
export const WHATSAPP_PATTERN = /^\+213\d{9}$/;

/** Aplatit un objet JSON en clés pointées : { a: { b: 1 } } → { "a.b": 1 }. */
function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** Liste les clés de messages dont la valeur contient le marqueur placeholder. */
function scanMessages(messagesDir) {
  const hits = [];
  if (!existsSync(messagesDir)) return hits;
  for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(messagesDir, file), "utf8"));
    const flat = flatten(data);
    for (const [key, value] of Object.entries(flat)) {
      if (typeof value === "string" && value.includes(PLACEHOLDER_MARKER)) {
        hits.push({ file, key });
      }
    }
  }
  return hits;
}

/** Valide le numéro WhatsApp au format international (+213…). */
function checkWhatsApp(value) {
  if (!value) return { ok: false, reason: "absent" };
  const normalized = value.replace(/[\s-]/g, "");
  if (!WHATSAPP_PATTERN.test(normalized)) {
    return { ok: false, reason: "format invalide (attendu +213 suivi de 9 chiffres)", value };
  }
  return { ok: true };
}

/**
 * Exécute le contrôle. Retourne { ok, count, violations, placeholders,
 * comingSoon, whatsapp, appEnv } — ok === (count === 0), quel que soit le mode ;
 * c'est l'appelant (main) qui décide d'échouer ou non selon strict.
 *
 * @param {{ env?: { NEXT_PUBLIC_WHATSAPP_NUMBER?: string, APP_ENV?: string }, messagesDir?: string, manifestPath?: string, strict?: boolean }} [options]
 */
export function runCheck({ env = process.env, messagesDir, manifestPath, strict = false } = {}) {
  const md = messagesDir ?? join(ROOT, "messages");
  const mp = manifestPath ?? join(ROOT, "src", "lib", "content", "check-manifest.json");

  const placeholderHits = scanMessages(md);
  const placeholderItems = placeholderHits.map((h) => `${h.file} → ${h.key}`);

  let manifest = { comingSoonRoutes: [], legalRoutes: [] };
  if (existsSync(mp)) {
    manifest = JSON.parse(readFileSync(mp, "utf8"));
  }
  const comingSoon = manifest.comingSoonRoutes ?? [];

  // Pages légales encore en placeholder (sous-ensemble des placeholders).
  const legalPrefixes = (manifest.legalRoutes ?? [])
    .map((r) => (typeof r === "object" && r ? r.messageKey : null))
    .filter(Boolean);
  const legalPlaceholders = placeholderHits
    .filter((h) => legalPrefixes.some((p) => h.key === p || h.key.startsWith(`${p}.`)))
    .map((h) => h.key);

  const whatsapp = checkWhatsApp(env.NEXT_PUBLIC_WHATSAPP_NUMBER);
  const whatsappItems = whatsapp.ok
    ? []
    : [
        whatsapp.reason === "absent"
          ? "NEXT_PUBLIC_WHATSAPP_NUMBER absent"
          : `NEXT_PUBLIC_WHATSAPP_NUMBER ${whatsapp.reason} : ${whatsapp.value}`,
      ];

  // APP_ENV : exigé = "production" uniquement en strict (build:prod, CI).
  // Le script ne lit pas .env.local : la variable doit être dans le shell.
  const appEnvItems =
    strict && env.APP_ENV !== "production"
      ? [
          env.APP_ENV === undefined || env.APP_ENV === ""
            ? "APP_ENV absente (exigé : APP_ENV=production dans le shell)"
            : `APP_ENV=${env.APP_ENV} (exigé : production)`,
        ]
      : [];

  // Décompte en ensemble disjoint (les pages légales sont déjà dans placeholderItems).
  const count = placeholderItems.length + comingSoon.length + whatsappItems.length + appEnvItems.length;

  const categories = [
    { id: "placeholder", label: "contenus à fournir", items: placeholderItems },
    { id: "comingSoon", label: "routes « bientôt disponible »", items: comingSoon },
    {
      id: "legal",
      label: "pages légales encore placeholder",
      items: legalPlaceholders, // non comptés dans count (déjà dans placeholder)
      infoOnly: true,
    },
    { id: "whatsapp", label: "numéro WhatsApp", items: whatsappItems },
    { id: "appEnv", label: "APP_ENV", items: appEnvItems },
  ];

  const violations = categories
    .filter((c) => !c.infoOnly)
    .flatMap((c) => c.items.map((item) => ({ category: c.id, label: c.label, item })));

  return { ok: count === 0, count, violations, categories, placeholders: placeholderItems, comingSoon, whatsapp, appEnv: env.APP_ENV ?? null };
}

function main() {
  const strict = process.argv.includes("--strict");
  const res = runCheck({ strict });

  if (strict) {
    if (!res.ok) {
      console.error(`✗ Contrôle strict du contenu échoué — ${res.count} violation(s) :`);
      for (const v of res.violations) {
        console.error(`  • [${v.label}] ${v.item}`);
      }
      const legal = res.categories.find((c) => c.id === "legal");
      if (legal && legal.items.length > 0) {
        console.error(`  • [${legal.label}] ${legal.items.join(", ")}`);
      }
      console.error(
        "Renseignez les contenus (messages/*.json), retirez les routes « comingSoon » livrées, " +
          "fournissez un numéro WhatsApp au format +213… dans NEXT_PUBLIC_WHATSAPP_NUMBER, " +
          "et exportez APP_ENV=production dans le shell du build.",
      );
      process.exit(1);
    }
    console.log("✓ Contrôle strict du contenu : 0 violation.");
  } else if (res.count > 0) {
    console.warn(`⚠ ${res.count} avertissement(s) de contenu (non bloquant en dev/préprod) :`);
    for (const v of res.violations) {
      console.warn(`  • [${v.label}] ${v.item}`);
    }
  } else {
    console.log("✓ Contrôle de contenu : aucun avertissement.");
  }
}

// Exécuté directement (node scripts/…) mais pas importé par les tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
