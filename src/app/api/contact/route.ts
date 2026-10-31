import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneE164 } from "@/lib/phone";
import { CONSENT_VERSIONS } from "@/lib/leads/capture";
import { leadFormGuard } from "@/lib/leads/guard";
import { logEvent } from "@/lib/observability/logger";

const contactSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  message: z.string().trim().min(5).max(2000),
  consentRecontact: z.literal(true),
  consentMarketing: z.boolean().default(false),
  consentAge18: z.literal(true),
  turnstileToken: z.string().min(1).max(2048).optional(),
  website: z.string().optional(), // honeypot — doit rester vide
});

/**
 * Formulaire de contact (PRD §11 — source `contact`) : même pipeline de
 * sécurité que le quiz (honeypot, rate limit IP hachée, Turnstile échec
 * fermé), même transaction `submit_lead` (lead + consentements ensemble).
 * Le message est conservé dans `leads.notes` (ajout, jamais écrasé).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const guard = await leadFormGuard(request, {
    bucketPrefix: "lead_contact_ip",
    limit: 3,
    windowSeconds: 600,
    honeypot: raw.website,
    turnstileToken: raw.turnstileToken,
  });
  if (guard === "honeypot") {
    logEvent({ level: "info", event: "contact_honeypot" });
    return NextResponse.json({ ok: true });
  }
  if (guard === "rate_limited") {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (guard === "captcha_failed") {
    return NextResponse.json({ error: "captcha_requis" }, { status: 403 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { name, phone, email, message, consentMarketing } = parsed.data;

  const phoneNorm = normalizePhoneE164(phone);
  if (!phoneNorm) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("submit_lead", {
    p_name: name,
    p_phone: phone,
    p_phone_norm: phoneNorm,
    p_email: email && email !== "" ? email : null,
    p_goal: null,
    p_offer_slug: null,
    p_source: "contact",
    p_answers: null,
    p_recommended_slug: null,
    p_result_token_hash: null,
    p_result_token_expires_at: null,
    p_notes: message,
    p_consent_recontact_version: CONSENT_VERSIONS.recontact,
    p_consent_marketing_version: consentMarketing ? CONSENT_VERSIONS.marketing : null,
    p_consent_age18_version: CONSENT_VERSIONS.age18,
  });

  if (error) {
    logEvent({ level: "error", event: "contact_submit_failed", message: error.message });
    return NextResponse.json({ error: "enregistrement_impossible" }, { status: 500 });
  }

  logEvent({ level: "info", event: "submit_lead", source: "contact" });

  return NextResponse.json({ ok: true });
}
