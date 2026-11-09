import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, emailRateLimitKey, ipRateLimitKey } from "@/lib/security/rate-limit";

const emailSchema = z.object({
  email: z.email().max(254),
});

/**
 * Lien magique par e-mail — mode d'authentification principal (PRD §15).
 * Connexion seule : les inscriptions publiques sont désactivées (config
 * Supabase, décision M6) — un e-mail inconnu est traité exactement comme
 * un e-mail connu (réponse identique, pas d'énumération de comptes).
 * Limitation de débit PAR IP ET PAR E-MAIL (e-mail haché avec sel HMAC,
 * jamais en clair dans les compteurs).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const { email } = parsed.data;

  const [byIp, byEmail] = await Promise.all([
    // IP élargie 30/900 (correction avant M9 : NAT/bureau) — exactement
    // DEUX buckets ici (pin de test) ; le e-mail reste le seuil fin 5/900.
    checkRateLimit(ipRateLimitKey(request.headers, "auth_magic_ip"), 30, 900),
    checkRateLimit(emailRateLimitKey(email, "auth_magic_email"), 5, 900),
  ]);
  if (!byIp || !byEmail) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
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
