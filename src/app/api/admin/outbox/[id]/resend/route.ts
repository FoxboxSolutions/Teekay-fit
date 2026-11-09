import { NextResponse } from "next/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";

const RESEND_LIMIT = 20;
const RESEND_WINDOW = 600;

/**
 * Renvoi idempotent d'un e-mail en échec (outbox).
 * - échec (failed) => remis en file d'attente (queued), le mailer le
 *   retraitera ;
 * - déjà en attente ou déjà envoyé => succès neutre (idempotent, aucun
 *   doublon) ;
 * - l'action est auditee (email_resend) et limitee en debit.
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

  const limited = await checkRateLimit(ipRateLimitKey(request.headers, "outbox_resend_ip"), RESEND_LIMIT, RESEND_WINDOW);
  if (!limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(RESEND_WINDOW) } });
  }

  const admin = createSupabaseAdminClient();
  const { data: outbox, error } = await admin
    .from("email_outbox")
    .select("id, payment_id, event_type, status")
    .eq("id", id)
    .single();
  if (error || !outbox) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = outbox as { id: string; payment_id: string; event_type: string; status: string };
  if (row.status !== "failed") {
    // Déjà pris en charge : aucun doublon, réponse neutre (idempotence).
    return NextResponse.json({ ok: true, status: row.status, idempotent: true });
  }

  const { error: updateError } = await admin.from("email_outbox").update({ status: "queued" }).eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: guard.auth.userId,
    actor_role: "admin",
    action: "email_resend",
    entity_type: "email_outbox",
    entity_id: id,
    metadata: { outbox_id: id, payment_id: row.payment_id, event_type: row.event_type },
  });

  return NextResponse.json({ ok: true, status: "queued" });
}
