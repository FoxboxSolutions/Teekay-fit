import { NextResponse } from "next/server";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import { fusedRateLimitKey } from "@/lib/security/rate-keys";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashStatusToken } from "@/lib/payments/status-token";
import {
  PROOF_MAX_INPUT_BYTES,
  detectImageMime,
  isValidTransactionReference,
  repackProofImage,
  uploadProofImage,
} from "@/lib/payments/proof";
import { getPaymentProvider } from "@/lib/payments/loader";

/**
 * M7a — soumission d'une preuve de paiement par le client depuis sa page de
 * statut (POST /api/orders/[reference]/proof).
 *
 * Garde anti-abus : jeton de statut (capacité secrète, seul son hash est en
 * base) + limitation de débit par IP hachée. La capture est optionnelle ;
 * si présente : type vérifié par magie du fichier (jamais le Content-Type),
 * taille limitée, ré-encodage webp (EXIF retiré), chemin regénéré, upload
 * dans le bucket privé.
 * Le paiement passe en `verifying` UNIQUEMENT via transition_payment
 * (acteur système — jamais d'écriture directe sur payments).
 *
 * Anti-fraude : la même référence de transaction sur deux commandes
 * distinctes lève le drapeau admin (needs_admin_review + audit) ; la
 * réponse au client reste neutre et identique.
 */

const ALLOWED_PAYMENT_STATUSES = new Set(["pending", "verifying"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;

  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "requête_invalide" }, { status: 400 });
  }
  if (!form) return NextResponse.json({ error: "requête_invalide" }, { status: 400 });

  // Rate limit de WRITE : IP 30/600 (correction avant M9 : élargie NAT)
  // PUIS clé fusée IP+référence 10/600 — le même couple (IP, commande)
  // reste strict. La référence est une donnée publique ; elle est tout de
  // même hachée (jamais de valeur brute dans les compteurs).
  const ipKey = ipRateLimitKey(request.headers, "order_proof_ip");
  const allowed = await checkRateLimit(ipKey, 30, 600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }
  const byReference = await checkRateLimit(
    fusedRateLimitKey(
      [ipKey, `order_proof_ref:${reference.trim().toLowerCase().slice(0, 64)}`],
      "order_proof_ip_fused",
    ),
    10,
    600,
  );
  if (!byReference) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const statusToken = String(form.get("statusToken") ?? "");
  const txn = String(form.get("txn") ?? "").trim();
  const capture = form.get("capture");

  if (!/^[A-Za-z0-9][A-Za-z0-9-]{3,60}$/.test(reference)) {
    return NextResponse.json({ error: "requête_invalide" }, { status: 400 });
  }
  if (!isValidTransactionReference(txn)) {
    return NextResponse.json({ error: "reference_invalide" }, { status: 400 });
  }

  const provider = getPaymentProvider();
  if (provider !== null && provider.name !== "fake") {
    // Fournisseur réel (M7b) configuré : la preuve manuelle est refusée.
    return NextResponse.json({ error: "indisponible" }, { status: 400 });
  }

  if (statusToken.length < 16) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const tokenHash = hashStatusToken(statusToken);
    const { data: orderRows } = await admin
      .from("orders")
      .select("id,status,needs_admin_review")
      .eq("reference", reference)
      .eq("status_token_hash", tokenHash)
      .gt("status_token_expires_at", new Date().toISOString())
      .limit(1);
    const order = orderRows?.[0];
    if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const orderId = order.id;

    const { data: paymentRows } = await admin
      .from("payments")
      .select("id,status,amount_da")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1);
    const payment = paymentRows?.[0];
    if (!payment) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (!ALLOWED_PAYMENT_STATUSES.has(payment.status)) {
      return NextResponse.json({ error: "non_soumissible" }, { status: 400 });
    }

    let objectPath: string | null = null;
    let mime: string | null = null;
    let sizeBytes: number | null = null;
    if (capture instanceof File && capture.size > 0) {
      if (capture.size > PROOF_MAX_INPUT_BYTES) {
        return NextResponse.json({ error: "capture_trop_lourde" }, { status: 400 });
      }
      const input = Buffer.from(await capture.arrayBuffer());
      const detected = detectImageMime(input.subarray(0, 12));
      if (!detected) {
        return NextResponse.json({ error: "type_invalide" }, { status: 400 });
      }
      const { webp, bytes } = await repackProofImage(input);
      const uploaded = await uploadProofImage(orderId, webp);
      objectPath = uploaded.objectPath;
      mime = "image/webp";
      sizeBytes = bytes;
    }

    const inserted = await admin
      .from("payment_proofs")
      .insert({
        payment_id: payment.id,
        order_id: orderId,
        txn_reference: txn,
        object_path: objectPath,
        mime_type: mime,
        size_bytes: sizeBytes,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    const proofId = inserted.data.id;

    // Anti-fraude : la même référence sur une AUTRE commande ⇒ drapeau admin
    // + audit (acteur système, ids uniquement).
    const { data: dupRows } = await admin
      .from("payment_proofs")
      .select("id,order_id")
      .eq("txn_reference", txn)
      .neq("order_id", orderId)
      .limit(1);
    if (dupRows && dupRows.length > 0) {
      await admin.from("orders").update({ needs_admin_review: true }).eq("id", orderId);
      await admin.from("audit_logs").insert({
        actor_id: null,
        actor_role: "system",
        action: "proof_duplicate_txn_ref",
        entity_type: "order",
        entity_id: orderId,
        metadata: { payment_id: payment.id, other_order_id: dupRows[0]?.order_id },
      });
    }

    const transition = await admin.rpc("transition_payment", {
      p_payment_id: payment.id,
      p_to_status: "verifying",
      p_actor_role: "system",
      p_actor_id: null,
      p_reason: "preuve_soumise",
      p_provider_event_id: `proof:${proofId}`,
    });
    if (transition.error) throw transition.error;

    return NextResponse.json(
      { ok: true, status: "verifying", duplicated: Boolean(dupRows?.[0]) },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "order_proof_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ error: "requête_invalide" }, { status: 400 });
  }
}
