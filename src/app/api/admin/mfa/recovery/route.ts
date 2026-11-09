import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, recordAdminMfaSession } from "@/lib/auth/session";
import { consumeRecoveryCode } from "@/lib/auth/mfa-recovery";
import {
  checkRateLimit,
  ipRateLimitKey,
  peekRateLimit,
  userRateLimitKey,
} from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const recoverySchema = z.object({
  code: z.string().regex(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/),
});

/** Seuil PAR UTILISATEUR (M9a — ajustement) : même règle que le TOTP —
 * 5 échecs / 15 min puis blocage temporaire AUDITÉ. */
const USER_FAIL_LIMIT = 5;
const USER_FAIL_WINDOW = 900;

/**
 * Déblocage avec un code de secours (téléphone perdu) : consomme le code,
 * retire le facteur TOTP, trace l'action dans audit_logs, puis rend possible
 * une réactivation MFA. Procédure complète : docs/admin-mfa-recovery.md.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin({ requireMfa: false });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = recoverySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Blocage temporaire PAR UTILISATEUR (peek) — chaque refus est AUDITÉ (M9a).
  const userKey = userRateLimitKey(guard.auth.userId, "mfa_recovery_user");
  if ((await peekRateLimit(userKey, USER_FAIL_WINDOW)) >= USER_FAIL_LIMIT) {
    await createSupabaseAdminClient().from("audit_logs").insert({
      actor_id: guard.auth.userId,
      actor_role: "admin",
      action: "mfa_user_blocked",
      entity_type: "auth_user",
      entity_id: guard.auth.userId,
      metadata: { phase: "recovery" },
    });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(USER_FAIL_WINDOW) } },
    );
  }

  const limited = await checkRateLimit(ipRateLimitKey(request.headers, "mfa_recovery_ip"), 5, 900);
  if (!limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const consumed = await consumeRecoveryCode(guard.auth.userId, parsed.data.code);
  if (!consumed) {
    await checkRateLimit(userKey, USER_FAIL_LIMIT, USER_FAIL_WINDOW);
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Retrait du facteur TOTP (le code de secours le remplace une fois).
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = (factors?.all ?? []).find(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  if (totp) {
    await supabase.auth.mfa.unenroll({ factorId: totp.id });
  }

  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: guard.auth.userId,
    actor_role: "admin",
    action: "mfa.recovery_code_used",
    entity_type: "mfa_factor",
    entity_id: totp?.id ?? null,
    metadata: { method: "recovery_code" },
  });

  // Succès : consommer un code de secours remit aussi la session au aal2 —
  // le moment de vérification est enregistré (durée absolue de session).
  await recordAdminMfaSession(guard.auth.userId, guard.auth.sessionId);

  return NextResponse.json({ ok: true, mfaReset: true });
}
