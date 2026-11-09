import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";

const LEAD_PIPELINE_STATUSES = [
  "new",
  "contacted",
  "interested",
  "follow_up",
  "converted",
  "lost",
] as const;

// Écriture lead : filet IP large (même seuil que les formulaires publics M9a).
const LEAD_WRITE_LIMIT = 20;
const LEAD_WRITE_WINDOW = 600;

async function rateLimitedResponse() {
  return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(LEAD_WRITE_WINDOW) } });
}

/**
 * Changement de statut d'un lead dans le pipeline CRM.
 * Toute transition est auditee (ancien -> nouveau statut) ; aucune fusion
 * automatique (la revue des doublons reste humaine).
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

  const body = await request.json().catch(() => null);
  const parsed = z.object({ status: z.enum(LEAD_PIPELINE_STATUSES) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_status" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, name, status, phone_norm")
    .eq("id", id)
    .single();
  if (error || !lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const current = lead as { id: string; name: string; status: string; phone_norm: string | null };
  if (current.status === parsed.data.status) return NextResponse.json({ ok: true });

  const { error: updateError } = await supabase.from("leads").update({ status: parsed.data.status }).eq("id", id);
  if (updateError) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await createSupabaseAdminClient().from("audit_logs").insert({
    actor_id: guard.auth.userId,
    actor_role: "admin",
    action: "lead_status_changed",
    entity_type: "lead",
    entity_id: id,
    metadata: { lead_id: id, from: current.status, to: parsed.data.status, lead_name: current.name },
  });

  return NextResponse.json({ ok: true });
}
