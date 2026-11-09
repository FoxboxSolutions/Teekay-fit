import "server-only";
import { checkRateLimit, clientIp, ipRateLimitKey } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";

export type LeadFormGuardOutcome = "ok" | "honeypot" | "rate_limited" | "captcha_failed";

/**
 * Filet IP des formulaires publics (M9a — ajustement) : LARGE et
 * configurable (`LEAD_IP_BACKSTOP_LIMIT`, borné 1–60, défaut 30/600 s).
 * La protection PRINCIPALE est la clé identitaire (téléphone haché,
 * e-mail haché, fusée IP+identité) — un utilisateur légitime derrière une
 * IP partagée (bureau / NAT) reste sous le filet.
 */
export function leadIpBackstopLimit(): number {
  const raw = process.env.LEAD_IP_BACKSTOP_LIMIT;
  const value = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(value, 1), 60);
}

/**
 * Garde commune des formulaires publics de capture (M5, PRD §15) :
 * honeypot → identités (téléphone haché / e-mail haché / clé fusée
 * IP+identité — protection PRINCIPALE, M9a) → filet IP LARGE configurable
 * → Turnstile (échec fermé). Ordre séquentiel : le seuil identitaire est
 * le premier seuil croisé sur les écritures.
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
    /** Identités supplémentaires — clés DÉJÀ hachées (rate-keys.ts). */
    identities?: ReadonlyArray<{ key: string; limit: number; windowSeconds: number }>;
  },
): Promise<LeadFormGuardOutcome> {
  // 1. Honeypot : un humain ne remplit jamais ce champ. La route répond comme
  //    pour un vrai succès (aucune écriture) — indétectable pour un robot.
  if (typeof options.honeypot === "string" && options.honeypot.trim() !== "") {
    return "honeypot";
  }

  // 2. Identités (protection PRINCIPALE — clés DÉJÀ hachées, rate-keys.ts) :
  //    téléphone normalisé, e-mail haché, clé fusée IP+identité. Strict sur
  //    les écritures ; vérifiées AVANT le filet IP.
  for (const identity of options.identities ?? []) {
    const identityAllowed = await checkRateLimit(
      identity.key,
      identity.limit,
      identity.windowSeconds,
    );
    if (!identityAllowed) return "rate_limited";
  }

  // 3. Filet IP (hachée avec sel d'env — jamais d'IP en clair) : large et
  //    configurable — un utilisateur légitime derrière un NAT passe.
  const allowed = await checkRateLimit(
    ipRateLimitKey(request.headers, options.bucketPrefix),
    options.limit,
    options.windowSeconds,
  );
  if (!allowed) return "rate_limited";

  // 4. Turnstile : échec fermé (jeton/secret absent ou siteverify injoignable).
  const token = typeof options.turnstileToken === "string" ? options.turnstileToken : null;
  const captchaOk = await verifyTurnstile(token, clientIp(request.headers));
  return captchaOk ? "ok" : "captcha_failed";
}
