import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { consumeRecoveryCode } from "@/lib/auth/mfa-recovery";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const recoverySchema = z.object({
  code: z.string().regex(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/),
});

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

  const limited = await checkRateLimit(ipRateLimitKey(request.headers, "mfa_recovery_ip"), 5, 900);
  if (!limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const consumed = await consumeRecoveryCode(guard.auth.userId, parsed.data.code);
  if (!consumed) {
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

  return NextResponse.json({ ok: true, mfaReset: true });
}
