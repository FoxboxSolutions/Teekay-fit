import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";

const emailSchema = z.object({
  email: z.email().max(254),
});

/**
 * Lien magique par e-mail — mode d'authentification principal (PRD §15).
 * Validation zod + limitation de débit (10/15 min par IP + par e-mail).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const { email } = parsed.data;

  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(ipRateLimitKey(request.headers, "auth_magic_ip"), 10, 900),
    checkRateLimit(`auth_magic_email:${email.toLowerCase()}`, 5, 900),
  ]);
  if (!byIp || !byEmail) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/`,
    },
  });

  if (error) {
    console.error(JSON.stringify({ level: "error", event: "magic_link_error", error: error.message }));
    // Réponse identique que l'e-mail existe ou non (pas d'énumération de comptes).
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
