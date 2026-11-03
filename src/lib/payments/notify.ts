import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { defaultStatusTokenExpiry, createStatusToken } from "@/lib/payments/status-token";
import { getMailer } from "@/lib/mailer/provider";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notifications client M7a — effets de la confirmation admin :
 *  - CONFIRMATION : e-mail au client (adresse de la commande) montant le
 *    reçu manual BaridiMob, avec un LIEN DE SUIVI RÉGÉNÉRÉ (nouveau jeton
 *    via renew_order_status_token — le jeton brut n'est jamais stocké,
 *    seule sa création le retourne) ;
 *  - REJET : message NEUTRE avec la marche à suivre (aucun détail
 *    technique, jamais la référence de transaction d'un tiers).
 *
 * IDEMPOTENCE : table email_outbox, unique (payment_id, event_type).
 *  - la notification réserve sa ligne AVANT l'envoi (upsert
 *    ignoreDuplicates) ; un rejeu de la route trouve zéro ligne rendue
 *    (déjà envoyée) ⇒ aucun double envoi ;
 *  - l'échec d'envoi est marqué (status failed, attempts) — l'e-mail
 *    reste never-fatal : la requête admin ne dépendera jamais de l'envoi.
 *
 * Les textes sont en fr (locale unique du projet) ; subjectKey conserve la
 * clé i18n documentaire (traduction multilingue au besoin).
 */
export type NotifyStatus =
  | "sent"
  | "failed"
  | "skipped_replay"
  | "no_email"
  | "not_found";

export type NotifyResult = { status: NotifyStatus };

type OrderContext = {
  reference: string;
  totalDa: number;
  email: string;
};

const APP_URL_FALLBACK = "http://localhost:3000";

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || APP_URL_FALLBACK;
}

async function loadOrderContext(
  admin: SupabaseClient,
  orderId: string,
): Promise<OrderContext | null> {
  const { data, error } = await admin
    .from("orders")
    .select("reference,total_da,customers(email)")
    .eq("id", orderId)
    .single();
  if (error || !data) return null;
  const row = data as unknown as {
    reference: string;
    total_da: number;
    customers: { email: string | null } | null;
  };
  const email = row.customers?.email ?? null;
  if (!email) return null;
  return { reference: row.reference, totalDa: row.total_da, email };
}

function followUpLink(token: string): string {
  return `${appBaseUrl()}/fr/orders/status?token=${token}`;
}

function confirmedSubject(reference: string): string {
  return `Commande ${reference} — paiement confirmé`;
}

function confirmedText(reference: string, totalDa: number, link: string): string {
  return [
    "Bonjour,",
    "",
    `Votre paiement de la commande ${reference} (${totalDa} DA) est confirmé. Votre accès est ouvert.`,
    "",
    `Suivi de votre commande : ${link}`,
    "",
    "À votre rythme, propre et net — l'équipe Teekay Fit.",
  ].join("\n");
}

function rejectedSubject(reference: string): string {
  return `Commande ${reference} — paiement non validé`;
}

/** Message neutre : marche à suivre, sans détail technique ni motif interne. */
function rejectedText(): string {
  return [
    "Bonjour,",
    "",
    "Nous n'avons pas pu valider le paiement de votre commande.",
    "Marche à suivre :",
    "  1. Reprenez un virement BaridiMob en vérifiant la référence et le montant exact de la commande ;",
    "  2. Repassez commande sur le site, ou contactez-nous sur WhatsApp (bouton du site) — nous traitons votre cas manuellement.",
    "",
    "Aucun montant ne vous est retenu à ce stade.",
    "",
    "L'équipe Teekay Fit.",
  ].join("\n");
}

type NotifyEvent = "confirmed" | "rejected";

const EVENT_TO_OUTBOX: Record<NotifyEvent, "payment_confirmed" | "payment_rejected"> = {
  confirmed: "payment_confirmed",
  rejected: "payment_rejected",
};

/**
 * Cœur unique : réservation outbox (idempotence) → contenu (jeton renouvelé
 * pour la confirmation) → envoi via le mailer configurable → marquage.
 */
async function notifyPaymentOutcome(input: {
  paymentId: string;
  orderId: string;
  event: NotifyEvent;
}): Promise<NotifyResult> {
  const { paymentId, orderId, event } = input;

  try {
    const admin = createSupabaseAdminClient();

    const context = await loadOrderContext(admin, orderId);
    if (!context) return { status: "no_email" };

    // 1) Réservation : unique(payment_id, event_type) ; un rejeu insère
    //    exactement 0 ligne ⇒ aucun double envoi possible en parallèle.
    const inserted = await admin
      .from("email_outbox")
      .insert({
        payment_id: paymentId,
        event_type: EVENT_TO_OUTBOX[event],
        recipient: context.email,
      })
      .select("id");
    if (!inserted.data || !Array.isArray(inserted.data) || inserted.data.length === 0) {
      return { status: "skipped_replay" };
    }
    const outboxId = (inserted.data[0] as { id: string }).id;

    // 2) Contenu.
    let subject: string;
    let text: string;
    if (event === "confirmed") {
      const fresh = createStatusToken();
      const { error: renewError } = await admin.rpc("renew_order_status_token", {
        p_order_id: orderId,
        p_new_status_token_hash: fresh.hash,
        p_expires_at: defaultStatusTokenExpiry().toISOString(),
      });
      if (renewError) {
        // Le jeton est la capacité de suivi :sans lui, on n'annonce pas une
        // confirmation dont l'admin a déjà défini le droit en base (le droit
        // reste ouvert — l'e-mail peut rejouer par l'outbox failed).
        await admin
          .from("email_outbox")
          .update({ status: "failed", last_error: "renew_token_failed" })
          .eq("id", outboxId);
        return { status: "failed" };
      }
      subject = confirmedSubject(context.reference);
      text = confirmedText(context.reference, context.totalDa, followUpLink(fresh.token));
    } else {
      subject = rejectedSubject(context.reference);
      text = rejectedText();
    }

    // 3) Envoi par le mailer configurable (jamais fatal).
    const mailer = getMailer();
    const sent = await mailer.send({
      to: context.email,
      subjectKey: `payment.notify.${event}`,
      params: { reference: context.reference, total: String(context.totalDa) },
      subject,
      text,
    });

    await admin
      .from("email_outbox")
      .update({
        status: sent ? "sent" : "failed",
        sent_at: sent ? new Date().toISOString() : null,
        last_error: sent ? null : "mailer_refused",
      })
      .eq("id", outboxId);

    return { status: sent ? "sent" : "failed" };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "payment_notify_failed",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    return { status: "failed" };
  }
}

/** E-mail de CONFIRMATION (appelé uniquement quand result === 'applied'). */
export async function notifyPaymentConfirmed(input: {
  paymentId: string;
  orderId: string;
}): Promise<NotifyResult> {
  return notifyPaymentOutcome({ ...input, event: "confirmed" });
}

/** Message neutre au REJET (motif interne jamais exposé au client). */
export async function notifyPaymentRejected(input: {
  paymentId: string;
  orderId: string;
}): Promise<NotifyResult> {
  return notifyPaymentOutcome({ ...input, event: "rejected" });
}
