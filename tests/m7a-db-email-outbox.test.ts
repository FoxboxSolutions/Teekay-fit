import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M7a bloc 5 — DB outbox e-mail (idempotence réelle) :
 *  - contrainte UNIQUE (payment_id, event_type) : un second envoi de la
 *    même notification est refusé EN BASE (l'appelant interprète le
 *    conflit « already sent ») ;
 *  - event_type restreint (check) ;
 *  - RLS : anon/authenticated refusés (aucune politique) — un client ne
 *    lit JAMAIS la boîte d'envoi (adresses, statuts) ;
 *  - service role : lecture + écriture OK.
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const uidA = crypto.randomUUID();
const PASSWORD = `Str0ng-${runId}-pass`;

let admin: SupabaseClient;
let anon: SupabaseClient;
let userA: SupabaseClient;

let customerId: string;
let orderId: string;
let paymentId: string;

async function signIn(email: string) {
  const c = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(error.message);
  return c;
}

beforeAll(async () => {
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.auth.admin.createUser({ id: uidA, email: `m7a5-a-${runId}@test.local`, password: PASSWORD, email_confirm: true });
  userA = await signIn(`m7a5-a-${runId}@test.local`);

  const cust = await admin
    .from("customers")
    .insert({ profile_id: uidA, name: "Client", phone: `+2137${runId.slice(-8)}`, email: `m7a5-a-${runId}@test.local` })
    .select("id")
    .single();
  customerId = (cust.data as { id: string }).id;
  const ord = await admin
    .from("orders")
    .insert({
      reference: `TKF-P5-${runId}`,
      customer_id: customerId,
      offer_slug: "starter",
      offer_name: "Starter",
      unit_price_da: 2000,
      discount_da: 0,
      total_da: 2000,
    })
    .select("id")
    .single();
  orderId = (ord.data as { id: string }).id;
  const pay = await admin
    .from("payments")
    .insert({ order_id: orderId, provider: "fake", amount_da: 2000, status: "pending" })
    .select("id")
    .single();
  paymentId = (pay.data as { id: string }).id;
}, 120_000);

afterAll(async () => {
  if (orderId) await admin.from("email_outbox").delete().eq("payment_id", paymentId);
  if (paymentId) await admin.from("payments").delete().eq("id", paymentId);
  if (orderId) await admin.from("orders").delete().eq("id", orderId);
  if (customerId) await admin.from("customers").delete().eq("id", customerId);
  await admin.auth.admin.deleteUser(uidA).catch(() => undefined);
});

describe("email_outbox — idempotence (unique payment_id + event_type)", () => {
  it("service role : première réservation OK ; DOUBLON refusé par la contrainte unique", async () => {
    const first = await admin.from("email_outbox").insert({
      payment_id: paymentId,
      event_type: "payment_confirmed",
      recipient: `m7a5-a-${runId}@test.local`,
    });
    expect(first.error).toBeNull();

    const replay = await admin.from("email_outbox").insert({
      payment_id: paymentId,
      event_type: "payment_confirmed",
      recipient: `m7a5-a-${runId}@test.local`,
    });
    expect(replay.error).not.toBeNull();
    expect(JSON.stringify(replay.error)).toContain("23505");

    // Deux événements différents = deux lignes autorisées (confirmés + rejets).
    const other = await admin.from("email_outbox").insert({
      payment_id: paymentId,
      event_type: "payment_rejected",
      recipient: `m7a5-a-${runId}@test.local`,
    });
    expect(other.error).toBeNull();
  });

  it("event_type restreint : valeur inconnue refusée (check 23514)", async () => {
    const bad = await admin.from("email_outbox").insert({
      payment_id: paymentId,
      event_type: "spam",
      recipient: "x@test.local",
    });
    expect(bad.error).not.toBeNull();
    expect(JSON.stringify(bad.error)).toContain("23514");
  });

  it("anon : SELECT refusé, INSERT refusé (aucune politique)", async () => {
    const sel = await anon.from("email_outbox").select("id");
    expect(sel.error).not.toBeNull();
    expect(sel.data ?? []).toEqual([]);

    const ins = await anon.from("email_outbox").insert({
      payment_id: paymentId,
      event_type: "payment_confirmed",
      recipient: "victim@test.local",
    });
    expect(ins.error).not.toBeNull();
    expect(JSON.stringify(ins.error)).toContain("42501");
  });

  it("client authentifié : SELECT refusé (aucun grant) — boîte d'envoi invisible d'un client", async () => {
    const sel = await userA.from("email_outbox").select("id");
    expect(sel.error).not.toBeNull();
    expect(JSON.stringify(sel.error)).toContain("42501");
    expect(sel.data ?? []).toEqual([]);
  });
});
