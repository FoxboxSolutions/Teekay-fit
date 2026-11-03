import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyPaymentConfirmed } from "@/lib/payments/notify";

/**
 * M7a — CONFIRMATION d'un paiement vérifié (route admin).
 * Garde : requireAdminAal2 — AUCUNE confirmation sans second facteur.
 * L'admin doit saisir le MONTANT REÇU : différent du montant attendu
 * (copie figée) ⇒ refusé, aucun changement d'état.
 * La transition passe UNIQUEMENT par transition_payment (acteur admin) :
 * entitlements ouverts une seule fois, place consommée une seule fois,
 * journal append-only. Une ligne audit_logs complète l'action (acteur,
 * motif, horodatage). Un rejeu est un no-op (transition « unchanged »),
 * sans double audit.
 */

const confirmSchema = z.object({
  amountDa: z.number().int().min(1),
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

  const body = (await request.json().catch(() => null)) as { amountDa?: number } | null;
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "montant_manquant" }, { status: 400 });
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

  // Montant attendu : copie figée de la commande (jamais recalculé ici).
  const { data: paymentRows, error: payError } = await admin
    .from("payments")
    .select("id,order_id,amount_da,status")
    .eq("id", paymentId)
    .limit(1);
  if (payError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin_confirm_read_failed",
        error: payError.message,
      }),
    );
    return NextResponse.json({ error: "indisponible" }, { status: 500 });
  }
  const payment = (paymentRows ?? [])[0] as
    | { id: string; order_id: string; amount_da: number; status: string }
    | undefined;
  if (!payment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Anti-fraude : un montant différent est refusé (aucun changement d'état).
  if (parsed.data.amountDa !== payment.amount_da) {
    return NextResponse.json({ error: "montant_invalide" }, { status: 400 });
  }

  // Transition verifying→confirmed (arc M6). Acteur admin porte le uid : le
  // rapprochement est tracé côté payment_transitions ; audit_logs complète.
  const transition = await admin.rpc("transition_payment", {
    p_payment_id: payment.id,
    p_to_status: "confirmed",
    p_actor_role: "admin",
    p_actor_id: adminUid,
    p_reason: "montant_recu_verifie",
    p_provider_event_id: `admin_confirm:${payment.id}`,
  });
  if (transition.error) {
    const message = transition.error.message;
    // Transaction interdite ou déjà appliquée : réponse neutre (pas de détail).
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin_confirm_transition_failed",
        error: message,
      }),
    );
    return NextResponse.json({ error: "non_soumissible" }, { status: 400 });
  }

  const result = transition.data as { result?: string } | null;

  // Idempotence du rejeu : si la transition était déjà appliquée
  // (« unchanged »), pas d'audit en double — le droit est déjà ouvert.
  if (result?.result === "unchanged") {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: adminUid,
    actor_role: "admin",
    action: "payment_confirm_admin",
    entity_type: "payment",
    entity_id: payment.id,
    metadata: {
      order_id: payment.order_id,
      amount_da: parsed.data.amountDa,
    },
  });
  if (auditError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin_confirm_audit_failed",
        error: auditError.message,
      }),
    );
  }

  // Notification client : UNE SEULE FOIS (outbox unique payment+event),
  // seulement quand la transition est réellement appliquée, jamais sur un
  // rejeu (« unchanged » ⇒ renvoyé avant ce point, sans envoi ni audit).
  await notifyPaymentConfirmed({ paymentId: payment.id, orderId: payment.order_id });

  return NextResponse.json({ ok: true, unchanged: false });
}
