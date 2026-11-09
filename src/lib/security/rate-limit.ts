import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Limitation de débit côté serveur (PRD §15) : appelle la fonction Postgres
 * check_rate_limit (migration 0002). Clé = domaine :identifiant.
 */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fail closed : en cas d'erreur on refuse plutôt que de laisser passer.
    console.error(JSON.stringify({ level: "error", event: "rate_limit_error", error: error.message }));
    return false;
  }

  return data === true;
}

/** Limitation de débit par IP (headers proxy : x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first) return first.trim();
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * LECTURE SANS INCRÉMENT du compteur d'un bucket (M9a — ajustement) :
 * sémantique identique à check_rate_limit (fenêtre glissante), mais
 * SURVEILLANCE seule. Sert à refuser un compte déjà « bloqué
 * temporairement » (MFA : 5 échecs / 15 min) SANS consommer une tentative
 * légitime — les échecs seuls s'incrémentent via check_rate_limit.
 * Consommé uniquement par les routes MFA (aucun mock partiel de ce module
 * sur ces routes) — ne pas exporter vers des routes dont les tests
 * substituent partiellement rate-limit.
 */
export async function peekRateLimit(
  bucket: string,
  windowSeconds: number,
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("peek_rate_limit", {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail closed : une erreur de lecture est traitée comme « déjà au
    // plafond » plutôt que comme « libre ».
    console.error(
      JSON.stringify({ level: "error", event: "rate_limit_peek_error", error: error.message }),
    );
    return Number.MAX_SAFE_INTEGER;
  }
  return data ?? 0;
}

let processLocalSalt: string | null = null;

/**
 * Sel d'env pour les clés de rate limit (PRD §15 : jamais d'IP en clair).
 * `RATE_LIMIT_SALT` manquant ⇒ sel aléatoire local + erreur loguée : les
 * compteurs restent hachés mais ne sont plus partagés entre instances.
 */
function rateLimitSalt(): string {
  const fromEnv = process.env.RATE_LIMIT_SALT;
  if (fromEnv) return fromEnv;
  if (!processLocalSalt) {
    processLocalSalt = randomBytes(32).toString("hex");
    console.error(
      JSON.stringify({
        level: "error",
        event: "rate_limit_salt_missing",
        detail: "RATE_LIMIT_SALT absent : sel local aléatoire, limites valables par instance",
      }),
    );
  }
  return processLocalSalt;
}

/**
 * Clé de rate limit par E-MAIL : HMAC-SHA256 (sel d'env, e-mail normalisé).
 * L'e-mail en clair n'atteint jamais la table `rate_limit_counters` —
 * l'e-mail est déjà une donnée personnelle : seul son hash avec sel est
 * compteur (décision augmentée M6, même règle que l'IP).
 */
export function emailRateLimitKey(email: string, prefix: string): string {
  const normalized = email.trim().toLowerCase();
  const digest = createHmac("sha256", rateLimitSalt()).update(normalized).digest("hex");
  return `${prefix}:${digest}`;
}

/**
 * Clé de rate limit par IP : HMAC-SHA256 (sel d'env, IP) — l'IP en clair
 * n'atteint jamais la table `rate_limit_counters`. Accepte n'importe quel
 * objet « en-têtes » (`Headers` des routes, `await headers()` des pages).
 */
export function ipRateLimitKey(
  headers: { get(name: string): string | null },
  prefix: string,
): string {
  const ip = clientIp(headers as Headers);
  const digest = createHmac("sha256", rateLimitSalt()).update(ip).digest("hex");
  return `${prefix}:${digest}`;
}

/**
 * Clé de rate limit par UTILISATEUR connecté (M8 — téléchargements) :
 * HMAC-SHA256 (sel d'env, user id) — même hygiène : la clé en base n'est
 * jamais un identifiant en clair.
 */
export function userRateLimitKey(userId: string, prefix: string): string {
  const digest = createHmac("sha256", rateLimitSalt()).update(userId).digest("hex");
  return `${prefix}:${digest}`;
}
