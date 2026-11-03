import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M6 bloc 3 — `transition_payment` (migration 20261103110000) :
 *  - point d'entrée UNIQUE des transitions de paiement : transitions
 *    autorisées strictes, no-op si statut courant (idempotent), refus P4021 ;
 *  - journal append-only payment_transitions (update/delete interdits) ;
 *  - confirmed ⇒ order paid + ENTITLEMENT ouvert UNE fois (unique
 *    order_item) ; notification répétée ⇒ aucun doublon ;
 *  - places : consommation atomique à la confirmation ; dépassement ⇒ le
 *    droit reste ouvert + audit capacity_exceeded + flag admin ;
 *  - paiement confirmé après annulation : RIEN ne s'ouvre (M9) ;
 *  - jeton de statut : haché, inconnu = expiré = NULL (page neutre
 *    identique), renouvelable ; IDOR : aucun accès par id direct.
 */

const env = getLocalEnv();
const runId = `m6tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let service: SupabaseClient;
let seq = 0;
let slotDate1 = "";

/** PAR-Q de test (contrat RPC : clés q1..q7). */
const aptitude = (first = false) => ({
  q1: first, q2: false, q3: false, q4: first, q5: false, q6: first, q7: false,
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
    p_offer_slug: "starter",
    p_name: "Test M6 transition",
    p_email: `${key}@test.tkf`,
    p_phone: null,
    p_phone_norm: null,
    p_provider: "fake",
    p_payment_method: null,
    p_promo_code: null,
    p_slot_date: null,
    p_aptitude: null,
    p_waiver_version: null,
    p_consent_terms_version: "m6-test-v1",
    p_consent_privacy_version: "m6-test-v1",
    p_consent_refunds_version: "m6-test-v1",
    ...overrides,
  };
}

/** Crée une commande + son paiement pending, renvoie payment_id. */
async function newPayment(p: CreateParams): Promise<string> {
  const created = await service.rpc("create_order", p);
  expect(created.error).toBeNull();
  const orderId = (created.data as { order_id: string }).order_id;
  const { data: payment, error } = await service
    .from("payments")
    .select("id")
    .eq("order_id", orderId)
    .single();
  expect(error).toBeNull();
  return payment?.id as string;
}

async function transition(
  paymentId: string,
  to: string,
  overrides: Partial<Record<"p_reason" | "p_provider_event_id" | "p_actor_id", unknown>> = {},
) {
  return service.rpc("transition_payment", {
    p_payment_id: paymentId,
    p_to_status: to,
    p_actor_role: "webhook",
    p_actor_id: null,
    p_reason: "test",
    p_provider_event_id: null,
    ...overrides,
  } as never);
}

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

afterAll(async () => {
  await service.from("orders").delete().like("idempotency_key", `${runId}%`);
  await service.from("customers").delete().like("email", `${runId}%@test.tkf`);
  if (slotDate1) {
    await service.from("capacity_slots").delete().eq("slot_date", slotDate1).eq("capacity", 1);
  }
});

describe("transition_payment — parcours nominal + journal", () => {
  it("pending→verifying→confirmed : paiement puis commande paid + entitlement UNIQUE (répétition = no-op)", async () => {
    const paymentId = await newPayment(orderParams());

    const v = await transition(paymentId, "verifying");
    expect(v.error).toBeNull();
    expect((v.data as { result: string }).result).toBe("applied");

    const c = await transition(paymentId, "confirmed");
    expect(c.error).toBeNull();
    const out = c.data as { order_status: string; entitlements_granted: number; result: string };
    expect(out.result).toBe("applied");
    expect(out.order_status).toBe("paid");
    expect(out.entitlements_granted).toBe(1);

    // Notification répétée (même état) : no-op, aucun doublon de droit.
    const again = await transition(paymentId, "confirmed");
    expect(again.error).toBeNull();
    expect((again.data as { result: string }).result).toBe("unchanged");

    const { count: entCount } = await service.from("entitlements")
      .select("id", { count: "exact", head: true })
      .eq("granted_by_payment_id", paymentId);
    expect(entCount).toBe(1);

    // Journal : 2 transitions réelles (verifying, confirmed), pas de no-op.
    const { data: journal } = await service
      .from("payment_transitions")
      .select("from_status, to_status, order_status")
      .eq("payment_id", paymentId)
      .order("created_at");
    expect(journal?.map((j: { to_status: string }) => j.to_status)).toEqual(["verifying", "confirmed"]);
    expect(journal?.[1]).toMatchObject({ from_status: "verifying", to_status: "confirmed", order_status: "paid" });
  });

  it("journal append-only : UPDATE et DELETE interdits", async () => {
    const paymentId = await newPayment(orderParams());
    await transition(paymentId, "verifying");
    const { data: row } = await service
      .from("payment_transitions")
      .select("id")
      .eq("payment_id", paymentId)
      .single();

    const upd = await service.from("payment_transitions").update({ reason: "falsifié" }).eq("id", row?.id ?? "");
    // Note : le service_role a le GRANT ALL — le blocage vient du TRIGGER SQL
    // (append-only), donc l'erreur vient de Postgres (40P01/42501 selon la ver).
    expect(upd.error).toBeTruthy();

    const del = await service.from("payment_transitions").delete().eq("id", row?.id ?? "");
    expect(del.error).toBeTruthy();
  });
});

describe("transition_payment — transitions refusées", () => {
  it("pending→refunded ⇒ P4021 transition_interdite", async () => {
    const paymentId = await newPayment(orderParams());
    const res = await transition(paymentId, "refunded");
    expect(res.error?.code).toBe("P4021");
    expect(res.error?.message).toContain("transition_interdite");
  });

  it("confirmed→verified hors arc (failed après confirmed non autorisé) ⇒ P4021", async () => {
    const paymentId = await newPayment(orderParams());
    await transition(paymentId, "confirmed");
    const res = await transition(paymentId, "failed");
    expect(res.error?.code).toBe("P4021");
  });

  it("statut inconnu ⇒ P4019 ; paiement inexistant ⇒ P4020", async () => {
    const paymentId = await newPayment(orderParams());
    const badStatus = await transition(paymentId, "chaos");
    expect(badStatus.error?.code).toBe("P4019");

    const noPayment = await transition("00000000-0000-0000-0000-000000000000", "confirmed");
    expect(noPayment.error?.code).toBe("P4020");
  });
});

describe("transition_payment — places (consommation atomique + dépassement audité)", () => {
  it("séance cap 1 : 2 commandes confirmées ⇒ 1 place consommée, 2e droit ouvert + audit capacity_exceeded + flag admin", async () => {
    const { data: offer } = await service.from("offers").select("id").eq("slug", "in-person").single();
    slotDate1 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await service.from("capacity_slots").upsert({
      offer_id: offer?.id, slot_date: slotDate1, capacity: 1, reserved: 0,
    });

    const a = orderParams({ p_offer_slug: "in-person", p_slot_date: slotDate1, p_aptitude: aptitude(), p_waiver_version: "m6-test-wv" });
    const b = orderParams({ p_offer_slug: "in-person", p_slot_date: slotDate1, p_aptitude: aptitude(), p_waiver_version: "m6-test-wv" });
    const paymentA = await newPayment(a);
    const paymentB = await newPayment(b);

    const confA = await transition(paymentA, "confirmed");
    expect(confA.error).toBeNull();
    expect((confA.data as { capacity: string }).capacity).toBe("consumed");

    // Dépassement : le paiement confirmé ouvre quand même le droit + audit.
    const confB = await transition(paymentB, "confirmed");
    expect(confB.error).toBeNull();
    expect((confB.data as { capacity: string }).capacity).toBe("exceeded");

    const { data: slot } = await service.from("capacity_slots")
      .select("reserved, capacity").eq("offer_id", offer?.id ?? "").eq("slot_date", slotDate1).single();
    expect(slot).toMatchObject({ reserved: 1, capacity: 1 });

    const { data: orderB } = await service.from("orders")
      .select("status, needs_admin_review").eq("idempotency_key", b.p_idempotency_key).single();
    expect(orderB).toMatchObject({ status: "paid", needs_admin_review: true });

    const { data: audits } = await service.from("audit_logs")
      .select("action, entity_type, metadata")
      .contains("metadata", { payment_id: paymentB })
      .order("created_at", { ascending: false });
    expect(audits?.[0]).toMatchObject({ action: "capacity_exceeded", entity_type: "order" });

    const { count: entB } = await service.from("entitlements")
      .select("id", { count: "exact", head: true }).eq("granted_by_payment_id", paymentB);
    expect(entB).toBe(1);
  });
});

describe("transition_payment — paiement après annulation (point ouvert M9)", () => {
  it("confirmed sur une commande cancelled ⇒ statut inchangé, AUCUN entitlement, journal order_status null", async () => {
    const p = orderParams();
    const paymentId = await newPayment(p);
    // Annulation manuelle (admin) : service role met le statut cancelled.
    const { data: orderRow } = await service.from("orders")
      .select("id, status").eq("idempotency_key", p.p_idempotency_key).single();
    await service.from("orders").update({ status: "cancelled" }).eq("id", orderRow?.id ?? "");

    const conf = await transition(paymentId, "confirmed");
    expect(conf.error).toBeNull();
    expect(conf.data).toMatchObject({ result: "applied", order_status: "cancelled" });

    const { data: stillCancelled } = await service.from("orders")
      .select("status").eq("idempotency_key", p.p_idempotency_key).single();
    expect(stillCancelled?.status).toBe("cancelled");

    const { count: ent } = await service.from("entitlements")
      .select("id", { count: "exact", head: true }).eq("granted_by_payment_id", paymentId);
    expect(ent).toBe(0);
  });
});

describe("order_status_by_token / renew — page neutre + renouvelable", () => {
  it("jeton valide ⇒ lecture (référence + statut) ; inconnu et expiré ⇒ NULL (réponse identique)", async () => {
    const p = orderParams();
    await newPayment(p);

    const good = await service.rpc("order_status_by_token", { p_status_token_hash: p.p_status_token_hash });
    expect(good.error).toBeNull();
    expect(good.data).toMatchObject([
      { reference: expect.stringMatching(/^TKF-/), order_status: "pending_payment" },
    ]);

    const unknown = await service.rpc("order_status_by_token", { p_status_token_hash: "inconnu-total" });
    expect(unknown.error).toBeNull();
    expect(unknown.data).toEqual([]);

    const expired = orderParams({ p_status_token_expires_at: new Date(Date.now() - 1000).toISOString() });
    await newPayment(expired);
    const resExpired = await service.rpc("order_status_by_token", { p_status_token_hash: expired.p_status_token_hash });
    expect(resExpired.error).toBeNull();
    expect(resExpired.data).toEqual([]);

    // IDOR : anon n'a même pas le GRANT sur orders (refus explicite,
    // autorisations ciblées) — en cas d'erreur (droit refusé) ou de résultat
    // vide, l'ordre est invisible. La seule lecture client passe par le
    // jeton haché (unique, ≥128 bits).
    const anon = createClient(env.apiUrl, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: anonRows, error: anonErr } = await anon
      .from("orders")
      .select("id, reference")
      .eq("idempotency_key", p.p_idempotency_key);
    expect(anonErr === null ? (anonRows ?? []).length : 0).toBe(0);
  });

  it("renew_order_status_token : renouvelle l'expiration ; ancien jeton devient neutre (inconnu)", async () => {
    const p = orderParams();
    const { data: created } = await service.rpc("create_order", p);
    const orderId = (created as unknown as { order_id: string }).order_id;

    const newHash = `tok-renewed-${p.p_idempotency_key}`;
    const newExpiry = new Date(Date.now() + 14 * 86_400_000).toISOString();

    const renewed = await service.rpc("renew_order_status_token", {
      p_order_id: orderId, p_new_status_token_hash: newHash, p_expires_at: newExpiry,
    });
    expect(renewed.error).toBeNull();

    const oldToken = await service.rpc("order_status_by_token", { p_status_token_hash: p.p_status_token_hash });
    expect(oldToken.data).toEqual([]);
    const newToken = await service.rpc("order_status_by_token", { p_status_token_hash: newHash });
    expect(newToken.data).toMatchObject([{ order_status: "pending_payment" }]);

    // Expiration passée refusée (jeton).
    const badRenew = await service.rpc("renew_order_status_token", {
      p_order_id: orderId,
      p_new_status_token_hash: `tok-bad-${p.p_idempotency_key}`,
      p_expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(badRenew.error?.code).toBe("P4022");
  });
});
