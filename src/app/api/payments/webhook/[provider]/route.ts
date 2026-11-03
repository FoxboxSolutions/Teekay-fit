import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider, PaymentProviderConfigError } from "@/lib/payments/loader";
import { WebhookVerificationError } from "@/lib/payments/provider";
import { logEvent } from "@/lib/observability/logger";

/**
 * Webhook fournisseur (M6) — une route par fournisseur :
 *   POST /api/payments/webhook/[provider]
 *
 * Contrat (décision amendement 8) :
 *  - CORPS BRUT transmis intact au fournisseur (jamais re-formaté) ;
 *  - vérification authenticité (signature + tolérance d'horodatage) par la
 *    couche abstraite ; échec ⇒ 403, aucun détail d'horloge/signature ;
 *  - idempotence par payment_events (provider, provider_event_id) UNIQUE :
 *    une notification répétée ne re-passe pas dans le traitement ;
 *  - AUCUNE charge utile complète ni secret en log (identifiants seuls) ;
 *  - la transition passe par transition_payment (point d'entrée unique).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: requestedName } = await params;

  let provider;
  try {
    provider = getPaymentProvider();
  } catch (err) {
    if (err instanceof PaymentProviderConfigError) {
      // Aucun faux webhook ne peut être traité par un fournisseur incomplet.
      logEvent({ level: "info", event: "webhook_provider_unavailable", message: err.message });
    } else {
      logEvent({ level: "error", event: "webhook_provider_error", message: (err as Error).message });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 404 });
  }
  if (!provider || provider.name !== requestedName) {
    // Réponse uniforme : pas d'oracle sur la config (garde déjà démarrage).
    return NextResponse.json({ error: "forbidden" }, { status: 404 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = await provider.verifyWebhook(
      {
        signature: request.headers.get("x-signature"),
        timestamp: request.headers.get("x-timestamp"),
      },
      rawBody,
    );
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      logEvent({ level: "info", event: "webhook_rejected", provider: provider.name, reason: err.message });
      return NextResponse.json({ error: "signature_invalide" }, { status: 403 });
    }
    logEvent({ level: "error", event: "webhook_error", provider: provider.name });
    return NextResponse.json({ error: "erreur_webhook" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Idempotence : (provider_event_id) unique —-ignoreDuplicates ⇒ [] si déjà vu.
  const { data: insertedRows } = await admin
    .from("payment_events")
    .upsert(
      {
        provider: provider.name,
        provider_event_id: event.id,
        event_type: event.type,
        // AUCUN payload (ni le corps brut, ni les champs) : la table ne
        // trace que l'identité de l'événement ; le journal d'audit vivra
        // dans payment_transitions et audit_logs (M9 tamis).
        payload: {},
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    )
    .select("id");

  if (!insertedRows || insertedRows.length === 0) {
    // Notification répétée : déjà traitée (ou en cours) — succès silencieux.
    return NextResponse.json({ status: "duplicate" });
  }

  // Paiement visé par la référence fournie à la création.
  const { data: payment } = await admin
    .from("payments")
    .select("id, amount_da, status")
    .eq("provider", provider.name)
    .eq("provider_reference", event.payment_ref)
    .maybeSingle();

  if (!payment) {
    logEvent({ level: "info", event: "webhook_unknown_payment", provider: provider.name });
    return NextResponse.json({ status: "ignored" });
  }

  if (payment.amount_da !== event.amount_da) {
    // Montant contredit : aucune transition silencieuse — audité (M9 triera).
    await admin.from("audit_logs").upsert({
      action: "webhook_amount_mismatch",
      entity_type: "payment",
      entity_id: payment.id,
      metadata: { provider: provider.name, event_id: event.id },
    });
    return NextResponse.json({ status: "ignored" });
  }

  const { error: transitionError } = await admin.rpc("transition_payment", {
    p_payment_id: payment.id,
    p_to_status: event.type === "payment.confirmed" ? "confirmed" : "failed",
    p_actor_role: "webhook",
    p_actor_id: null,
    p_reason: null,
    p_provider_event_id: event.id,
  });

  return NextResponse.json({ status: transitionError ? "deferred" : "processed" });
}
