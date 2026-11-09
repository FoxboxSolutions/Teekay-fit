import { NextResponse } from "next/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";

const LEAD_WRITE_LIMIT = 20;
const LEAD_WRITE_WINDOW = 600;

async function rateLimitedResponse() {
  return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(LEAD_WRITE_WINDOW) } });
}

/**
 * Conversion d'un lead en client SANS doublon (numéros normalisés).
 * Si un client porte déjà le même téléphone normalisé, la conversion est
 * refusée (409) : la fusion de doublons reste une revue humaine, jamais
 * automatique (M9a). L'action est auditee.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireAdminAal2();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const limited = await checkRateLimit(ipRateLimitKey(request.headers, "leads_write_ip"), LEAD_WRITE_LIMIT, LEAD_WRITE_WINDOW);
  if (!limited) return rateLimitedResponse();

  const supabase = await createSupabaseServerClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, name, phone, phone_norm, email, status")
    .eq("id", id)
    .single();
  if (error || !lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const current = lead as { id: string; name: string; phone: string | null; phone_norm: string | null; email: string | null; status: string };
  if (current.status === "converted") return NextResponse.json({ error: "already_converted" }, { status: 409 });

  // Anti-doublon : même téléphone normalisé ⇒ refus, revue humaine requise.
  if (current.phone_norm) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("phone_norm", current.phone_norm)
      .limit(1);
    if (existing && existing.length > 0) {
      await createSupabaseAdminClient().from("audit_logs").insert({
        actor_id: guard.auth.userId,
        actor_role: "admin",
        action: "lead_conversion_blocked_duplicate",
        entity_type: "lead",
        entity_id: id,
        metadata: { lead_id: id, existing_customer_id: existing[0]!.id, reason: "duplicate_phone_norm" },
      });
      return NextResponse.json({ error: "duplicate_customer" }, { status: 409 });
    }
  }

  const { data: customer, error: insertError } = await supabase
    .from("customers")
    .insert({ name: current.name, phone: current.phone, phone_norm: current.phone_norm, email: current.email })
    .select("id")
    .single();
  if (insertError || !customer) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  const { error: updateError } = await supabase.from("leads").update({ status: "converted" }).eq("id", id);
  if (updateError) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await createSupabaseAdminClient().from("audit_logs").insert({
    actor_id: guard.auth.userId,
    actor_role: "admin",
    action: "lead_converted",
    entity_type: "lead",
    entity_id: id,
    metadata: { lead_id: id, customer_id: customer.id },
  });

  return NextResponse.json({ ok: true, customerId: customer.id });
}
