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
 * Clé de rate limit par IP : HMAC-SHA256 (sel d'env, IP) — l'IP en clair
 * n'atteint jamais la table `rate_limit_counters`.
 */
export function ipRateLimitKey(headers: Headers, prefix: string): string {
  const ip = clientIp(headers);
  const digest = createHmac("sha256", rateLimitSalt()).update(ip).digest("hex");
  return `${prefix}:${digest}`;
}
