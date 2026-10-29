import "server-only";
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
