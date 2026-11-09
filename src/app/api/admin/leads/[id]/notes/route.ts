import { NextResponse } from "next/server";
import { z } from "zod";
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
 * Notes admin-only d'un lead. Le contenu n'est jamais duplique dans le
 * journal d'audit (seul le fait d'écriture est trace) ; les reponses PAR-Q
 * ne doivent jamais y être saisies (espace sante séparé, accès sensible).
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
  const parsed = z.object({ notes: z.string().max(4000).optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_notes" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: lead, error } = await supabase.from("leads").select("id").eq("id", id).single();
  if (error || !lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error: updateError } = await supabase
    .from("leads")
    .update({ notes: parsed.data.notes ?? null })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await createSupabaseAdminClient().from("audit_logs").insert({
    actor_id: guard.auth.userId,
    actor_role: "admin",
    action: "lead_notes_updated",
    entity_type: "lead",
    entity_id: id,
    metadata: { lead_id: id },
  });

  return NextResponse.json({ ok: true });
}
