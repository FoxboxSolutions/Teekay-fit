import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { generateRecoveryCodes } from "@/lib/auth/mfa-recovery";

/**
 * Activation MFA TOTP pour un admin : enrôle le facteur et génère les codes
 * de secours (affichés une seule fois — procédure docs/admin-mfa-recovery.md).
 * requireMfa: false ici (le MFA n'existe pas encore au moment de l'activation).
 */
export async function POST() {
  const guard = await requireAdmin({ requireMfa: false });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: enrolled, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "admin-totp",
  });

  if (error || !enrolled) {
    console.error(JSON.stringify({ level: "error", event: "mfa_enroll_error", error: error?.message }));
    return NextResponse.json({ error: "enroll_failed" }, { status: 500 });
  }

  const recoveryCodes = await generateRecoveryCodes(guard.auth.userId);

  return NextResponse.json({
    factorId: enrolled.id,
    qrCode: enrolled.totp?.qr_code ?? null,
    secret: enrolled.totp?.secret ?? null,
    recoveryCodes,
  });
}
