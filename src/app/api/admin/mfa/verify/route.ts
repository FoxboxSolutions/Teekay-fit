import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, recordAdminMfaSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  ipRateLimitKey,
  peekRateLimit,
  userRateLimitKey,
} from "@/lib/security/rate-limit";

const verifySchema = z.object({
  factorId: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/),
});

/** Seuil PAR UTILISATEUR (M9a — ajustement) : 5 échecs / 15 min puis blocage
 * temporaire. Chaque échec enregistré ; le blocage est AUDITÉ. */
const USER_FAIL_LIMIT = 5;
const USER_FAIL_WINDOW = 900;

/** Vérification du défi TOTP : le MFA passe en statut vérifié. */
export async function POST(request: Request) {
  const guard = await requireAdmin({ requireMfa: false });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Fenêtre utilisateur : 5 échecs / 15 min = blocage temporaire (M9a). La
  // lecture est à part (peek) : une requête légitime ne s'auto-compte pas.
  const userKey = userRateLimitKey(guard.auth.userId, "mfa_verify_user");
  if ((await peekRateLimit(userKey, USER_FAIL_WINDOW)) >= USER_FAIL_LIMIT) {
    // Blocage AUDITÉ (M9a) — action neutre, sans aucun code ni facteur.
    await createSupabaseAdminClient().from("audit_logs").insert({
      actor_id: guard.auth.userId,
      actor_role: "admin",
      action: "mfa_user_blocked",
      entity_type: "auth_user",
      entity_id: guard.auth.userId,
      metadata: { phase: "verify" },
    });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(USER_FAIL_WINDOW) } },
    );
  }

  const limited = await checkRateLimit(ipRateLimitKey(request.headers, "mfa_verify_ip"), 10, 300);
  if (!limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "300" } },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });

  if (error) {
    // Échec : incrémenté UNIQUEMENT sur échec (5 échecs / 15 min = blocage).
    await checkRateLimit(userKey, USER_FAIL_LIMIT, USER_FAIL_WINDOW);
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Succès : le moment de vérification MFA est enregistré — la durée
  // ABSOLUE de session admin (défaut 12 h, configurable) court désormais.
  await recordAdminMfaSession(guard.auth.userId, guard.auth.sessionId);

  return NextResponse.json({ ok: true });
}
