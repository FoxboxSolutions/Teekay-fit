import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M9a (b) — « À traiter » : dépassements de places (capacity_exceeded).
 *
 * Preuve par la pratique, avec des données fictives et la chaîne EXISTANTE
 * (aucun nouveau chemin d'écriture) :
 *   1. séance « in-person » capacité 1 (capacity_slots, seed) ;
 *   2. deux commandes réelles via create_order (M6) puis confirmées via
 *      transition_payment (M6, migration 20261103110000) ;
 *   3. la 2e confirmation dépasse : capacity = "exceeded", drapeau
 *      orders.needs_admin_review = true (m6_create_order l.41, posé par
 *      m6_transition_payment l.115) et audit « capacity_exceeded » écrit
 *      (m6_transition_payment l.116-119, metadata = slot_date, offer_id,
 *      payment_id — AUCUNE donnée de santé) ;
 *   4. la requête EXACTE de la page /admin/a-traiter (a-traiter/page.tsx
 *      l.113-115, enrichie M9a : + offer_name, + slot_date) fait apparaître
 *      la commande en dépassement avec son offre et sa date — le compteur
 *      de la page compte cette ligne.
 */

const env = getLocalEnv();
const runId = `m9acap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let service: SupabaseClient;
let seq = 0;
let slotDate = "";
let offerId = "";

/** PAR-Q de test (contrat RPC : clés q1..q7). */
const aptitude = () => ({
  q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false,
  objective: "strength", experience_level: "beginner",
});

interface CreateParams {
  p_idempotency_key: string;
  p_request_hash: string;
  p_status_token_hash: string;
  p_status_token_expires_at: string;
  p_offer_slug: string;
  p_name: string;
  p_email: string;
  p_phone: string | null;
  p_phone_norm: string | null;
  p_provider: string;
  p_payment_method: string | null;
  p_promo_code: string | null;
  p_slot_date: string | null;
  p_aptitude: Record<string, unknown> | null;
  p_waiver_version: string | null;
  p_consent_terms_version: string;
  p_consent_privacy_version: string;
  p_consent_refunds_version: string;
}

function orderParams(overrides: Partial<CreateParams> = {}): CreateParams {
  seq += 1;
  const key = `${runId}-${seq}`;
  return {
    p_idempotency_key: key,
    p_request_hash: `hash-${key}`,
    p_status_token_hash: `tok-${key}`,
    p_status_token_expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    p_offer_slug: "in-person",
    p_name: "Test M9a capacité",
    p_email: `${key}@test.tkf`,
    p_phone: null,
    p_phone_norm: null,
    p_provider: "fake",
    p_payment_method: null,
    p_promo_code: null,
    p_slot_date: slotDate,
    p_aptitude: aptitude(),
    p_waiver_version: "m9a-test-wv",
    p_consent_terms_version: "m9a-test-v1",
    p_consent_privacy_version: "m9a-test-v1",
    p_consent_refunds_version: "m9a-test-v1",
    ...overrides,
  };
}

/** Crée une commande + son paiement pending, renvoie payment_id + order_id. */
async function newPayment(
  p: CreateParams,
): Promise<{ paymentId: string; orderId: string }> {
  const created = await service.rpc("create_order", p);
  expect(created.error).toBeNull();
  const orderId = (created.data as { order_id: string }).order_id;
  const { data: payment, error } = await service
    .from("payments")
    .select("id")
    .eq("order_id", orderId)
    .single();
  expect(error).toBeNull();
  return { paymentId: payment?.id as string, orderId };
}

async function confirm(paymentId: string) {
  return service.rpc("transition_payment", {
    p_payment_id: paymentId,
    p_to_status: "confirmed",
    p_actor_role: "webhook",
    p_actor_id: null,
    p_reason: "test m9a-b",
    p_provider_event_id: null,
  } as never);
}

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: offer } = await service.from("offers").select("id").eq("slug", "in-person").single();
  offerId = offer?.id as string;
  slotDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  await service.from("capacity_slots").upsert({
    offer_id: offerId, slot_date: slotDate, capacity: 1, reserved: 0,
  });
});

afterAll(async () => {
  await service.from("orders").delete().like("idempotency_key", `${runId}%`);
  await service.from("customers").delete().like("email", `${runId}%@test.tkf`);
  if (slotDate) {
    await service.from("capacity_slots").delete().eq("slot_date", slotDate).eq("offer_id", offerId);
  }
});

describe("M9a (b) — dépassement de places réel visible dans « À traiter »", () => {
  it("un dépassement créé par la chaîne existante (create_order + transition_payment) apparaît dans la liste de la page avec offre et date, sans donnée de santé", async () => {
    // ── Chaîne existante : 2 commandes présentielles confirmées, cap 1 ──
    const a = await newPayment(orderParams());
    const b = await newPayment(orderParams());

    const confA = await confirm(a.paymentId);
    expect(confA.error).toBeNull();
    expect((confA.data as { capacity: string }).capacity).toBe("consumed");

    const confB = await confirm(b.paymentId);
    expect(confB.error).toBeNull();
    expect((confB.data as { capacity: string }).capacity).toBe("exceeded");

    // ── Drapeau admin + audit (fichier cité : m6_transition_payment l.115-119) ──
    const { data: audits } = await service.from("audit_logs")
      .select("action, entity_type, metadata")
      .contains("metadata", { payment_id: b.paymentId })
      .order("created_at", { ascending: false });
    const capacityAudit = audits?.find(
      (a: { action: string }) => a.action === "capacity_exceeded",
    );
    expect(capacityAudit).toBeTruthy();
    expect((capacityAudit as { entity_type: string }).entity_type).toBe("order");
    // Aucune donnée de santé dans l'audit : metadata limitée à slot_date,
    // offer_id, payment_id.
    const metadata = (capacityAudit as { metadata: Record<string, unknown> }).metadata;
    expect(Object.keys(metadata).sort()).toEqual(["offer_id", "payment_id", "slot_date"]);

    // ── Requête EXACTE de la page /admin/a-traiter (a-traiter/page.tsx) ──
    const { data: reviewList, error } = await service
      .from("orders")
      .select("id, reference, total_da, status, needs_admin_review, offer_name, slot_date, created_at")
      .eq("needs_admin_review", true)
      .order("created_at", { ascending: false });
    expect(error).toBeNull();

    const exceeded = (reviewList ?? []).find(
      (o: { id: string }) => o.id === b.orderId,
    ) as { offer_name: string; slot_date: string; needs_admin_review: boolean } | undefined;
    expect(exceeded).toBeTruthy();
    expect(exceeded!.needs_admin_review).toBe(true);
    expect(exceeded!.offer_name).toBeTruthy();
    expect(exceeded!.slot_date).toBe(slotDate);

    // ── Le compteur de la page compte la ligne de dépassement ──
    // Le compteur rendu = length de cette même liste ; la commande de
    // dépassement y contribue (preuve : la ligne est bien dans la liste).
    expect((reviewList ?? []).some((o: { id: string }) => o.id === b.orderId)).toBe(true);

    // ── État vide explicite côté page : aucune donnée de santé ne fuite
    // dans la liste (colonnes limitées, select sans q1..q7).
    expect(JSON.stringify(exceeded)).not.toMatch(/q[1-7]/);
  });
});
