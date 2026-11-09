import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";

const verifySchema = z.object({
  factorId: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/),
});

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
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
