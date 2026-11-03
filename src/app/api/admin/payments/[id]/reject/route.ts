import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * M7a — REJET d'un paiement vérifié (route admin).
 * Garde : requireAdminAal2. Motif OBLIGATOIRE (zod, non vide) — journalisé
 * dans audit_logs (acteur, motif, horodatage) et payment_transitions via
 * transition_payment (acteur admin). Client recalibré : le message neutre
 * passe par la page de statut (bloc 7) ; aucun environnement technique ici.
 */

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const paramsSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminAal2();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const adminUid = guard.auth.userId;

  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "motif_manquant" }, { status: 400 });
  }

  let paymentId: string;
  try {
    const parsedId = paramsSchema.safeParse(id);
    if (!parsedId.success) throw new Error("id");
    paymentId = parsedId.data;
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();

  const { data: paymentRows, error: payError } = await admin
    .from("payments")
    .select("id,order_id,status")
    .eq("id", paymentId)
    .limit(1);
  if (payError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin_reject_read_failed",
        error: payError.message,
      }),
    );
    return NextResponse.json({ error: "indisponible" }, { status: 500 });
  }
  const payment = (paymentRows ?? [])[0] as
    | { id: string; order_id: string; status: string }
    | undefined;
  if (!payment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const transition = await admin.rpc("transition_payment", {
    p_payment_id: payment.id,
    p_to_status: "rejected",
    p_actor_role: "admin",
    p_actor_id: adminUid,
    p_reason: parsed.data.reason,
    p_provider_event_id: `admin_reject:${payment.id}`,
  });
  if (transition.error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin_reject_transition_failed",
        error: transition.error.message,
      }),
    );
    return NextResponse.json({ error: "non_soumissible" }, { status: 400 });
  }

  const result = transition.data as { result?: string } | null;
  if (result?.result === "unchanged") {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: adminUid,
    actor_role: "admin",
    action: "payment_reject_admin",
    entity_type: "payment",
    entity_id: payment.id,
    metadata: {
      order_id: payment.order_id,
      reason: parsed.data.reason,
    },
  });
  if (auditError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin_reject_audit_failed",
        error: auditError.message,
      }),
    );
  }

  return NextResponse.json({ ok: true, unchanged: false });
}
