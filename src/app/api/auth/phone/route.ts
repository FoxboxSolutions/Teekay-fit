import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { phoneRateLimitKey } from "@/lib/security/rate-keys";

const phoneSchema = z.object({
  // Format international : +213... 
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
});

/**
 * Connexion par téléphone (OTP) — DÉSACTIVÉE PAR DÉFAUT derrière le feature
 * flag AUTH_PHONE_ENABLED (lien magique e-mail = mode principal).
 */
export async function POST(request: Request) {
  if (process.env.AUTH_PHONE_ENABLED !== "true") {
    return NextResponse.json({ error: "phone_auth_disabled" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = phoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }
  const { phone } = parsed.data;

  const [byIp, byPhone] = await Promise.all([
    checkRateLimit(ipRateLimitKey(request.headers, "auth_phone_ip"), 10, 900),
    // Corrigé (avant M9) : le téléphone était en CLAIR dans les compteurs ;
    // désormais hashé HMAC avec sel d'env — le numéro entre toujours haché.
    checkRateLimit(phoneRateLimitKey(phone, "auth_phone_num"), 5, 900),
  ]);
  if (!byIp || !byPhone) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    console.error(JSON.stringify({ level: "error", event: "phone_otp_error", error: error.message }));
    return NextResponse.json({ error: "otp_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
