import { NextResponse } from "next/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAdminProofSignedUrl } from "@/lib/payments/proof";

/**
 * M7a — liste côté admin des paiements à vérifier (BaridiMob manuel).
 * Garde : requireAdminAal2 (aucune vue, aucune capture, sans aal2).
 * Réponse : référence commande, montant attendu (copie figée), preuves
 * (référence de transaction + capture via URL signée COURTE), drapeau
 * anti-fraude, frappe de doublon. Aucun numéro de compte ici (jamais
 * stocké dans ces tables).
 */

type ProofRow = {
  id: string;
  payment_id: string;
  order_id: string;
  txn_reference: string;
  object_path: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  order_id: string;
  amount_da: number;
  status: string;
  created_at: string;
};

type OrderRow = {
  id: string;
  reference: string;
  status: string;
  total_da: number;
  needs_admin_review: boolean;
};

type UserPayment = {
  paymentId: string;
  orderId: string;
  reference: string;
  expectedAmountDa: number;
  orderStatus: string;
  needsAdminReview: boolean;
  paymentCreatedAt: string;
  proofs: Array<{
    id: string;
    txnReference: string;
    captureUrl: string | null;
    createdAt: string;
    duplicate: boolean; // même référence de transaction sur une autre commande
  }>;
};

export async function GET() {
  const guard = await requireAdminAal2();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    const admin = createSupabaseAdminClient();

    // Paiements à vérifier : verifying (preuve soumise) ; le drapeau
    // anti-fraude (needs_admin_review) est porté par la commande jointe.
    const { data: payments, error } = await admin
      .from("payments")
      .select("id,order_id,amount_da,status,created_at")
      .eq("status", "verifying")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    const list = (payments ?? []) as PaymentRow[];
    if (list.length === 0) {
      return NextResponse.json({ payments: [] });
    }

    const orderIds = [...new Set(list.map((p) => p.order_id))];
    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id,reference,status,total_da,needs_admin_review")
      .in("id", orderIds);
    if (ordersError) throw ordersError;
    const orderById = new Map(
      ((orders ?? []) as OrderRow[]).map((o) => [o.id, o]),
    );

    const paymentIds = list.map((p) => p.id);
    const { data: proofs, error: proofsError } = await admin
      .from("payment_proofs")
      .select("id,payment_id,order_id,txn_reference,object_path,created_at")
      .in("payment_id", paymentIds)
      .order("created_at", { ascending: true });
    if (proofsError) throw proofsError;
    const proofRows = (proofs ?? []) as ProofRow[];

    // Anti-fraude : chaque référence de transaction est re-cherchée sur les
    // AUTRES commandes (rapprochement montré à l'admin).
    const txnRefs = [...new Set(proofRows.map((p) => p.txn_reference))];
    const dupByKey = new Map<string, string>(); // paymentId -> autreOrderId
    if (txnRefs.length > 0) {
      const { data: cross, error: crossError } = await admin
        .from("payment_proofs")
        .select("payment_id,order_id,txn_reference")
        .in("txn_reference", txnRefs);
      if (crossError) throw crossError;
      const rows = (cross ?? []) as Array<ProofRow>; // subset suffit
      for (const proof of proofRows) {
        const other = rows.find(
          (r) =>
            r.txn_reference === proof.txn_reference &&
            r.order_id !== proof.order_id,
        );
        if (other) dupByKey.set(proof.id, other.order_id);
      }
    }

    const result: UserPayment[] = [];
    for (const payment of list) {
      const order = orderById.get(payment.order_id);
      if (!order) continue;
      const paymentProofs = proofRows.filter((r) => r.payment_id === payment.id);
      result.push({
        paymentId: payment.id,
        orderId: payment.order_id,
        reference: order.reference,
        expectedAmountDa: order.total_da,
        orderStatus: order.status,
        needsAdminReview: order.needs_admin_review,
        paymentCreatedAt: payment.created_at,
        proofs: await Promise.all(
          paymentProofs.map(async (r) => ({
            id: r.id,
            txnReference: r.txn_reference,
            captureUrl: r.object_path
              ? await createAdminProofSignedUrl(r.object_path)
              : null,
            createdAt: r.created_at,
            duplicate: dupByKey.has(r.id),
          })),
        ),
      });
    }

    return NextResponse.json({ payments: result });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin_payments_list_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ error: "indisponible" }, { status: 500 });
  }
}

