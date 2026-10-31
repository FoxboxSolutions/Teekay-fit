import "server-only";
import { checkRateLimit, clientIp, ipRateLimitKey } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";

export type LeadFormGuardOutcome = "ok" | "honeypot" | "rate_limited" | "captcha_failed";

/**
 * Garde commune des formulaires publics de capture (M5, PRD §15) :
 * honeypot → limitation de débit par IP hachée → Turnstile (échec fermé).
 *
 * À appeler juste après la lecture du corps JSON, avant la validation zod.
 */
export async function leadFormGuard(
  request: Request,
  options: {
    bucketPrefix: string;
    limit: number;
    windowSeconds: number;
    honeypot: unknown;
    turnstileToken: unknown;
  },
): Promise<LeadFormGuardOutcome> {
  // 1. Honeypot : un humain ne remplit jamais ce champ. La route répond comme
  //    pour un vrai succès (aucune écriture) — indétectable pour un robot.
  if (typeof options.honeypot === "string" && options.honeypot.trim() !== "") {
    return "honeypot";
  }

  // 2. Limitation de débit (IP hachée avec sel d'env — jamais d'IP en clair).
  const allowed = await checkRateLimit(
    ipRateLimitKey(request.headers, options.bucketPrefix),
    options.limit,
    options.windowSeconds,
  );
  if (!allowed) return "rate_limited";

  // 3. Turnstile : échec fermé (jeton/secret absent ou siteverify injoignable).
  const token = typeof options.turnstileToken === "string" ? options.turnstileToken : null;
  const captchaOk = await verifyTurnstile(token, clientIp(request.headers));
  return captchaOk ? "ok" : "captcha_failed";
}
