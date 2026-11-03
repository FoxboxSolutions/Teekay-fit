import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M7a bloc 2 — DB preuves de paiement :
 *  - RLS payment_proofs : anon refusé (aucun grant), client = rien,
 *    admin = lecture OK ; écriture uniquement service role ;
 *  - storage : bucket privé `payment-proofs` existant, upload service role
 *    + URL signée courte générable, pas d'accès public ;
 *  - transition pending → verifying via transition_payment (acteur system).
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const uidA = crypto.randomUUID();
const uidC = crypto.randomUUID();
const PASSWORD = `Str0ng-${runId}-pass`;

let admin: SupabaseClient;
let anon: SupabaseClient;
let userA: SupabaseClient;
let userC: SupabaseClient;

let customerId: string;
let orderId: string;
let paymentId: string;
let proofId: string;
let storagePath: string;

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
  await admin.auth.admin.createUser({ id: uidA, email: `m7a2-a-${runId}@test.local`, password: PASSWORD, email_confirm: true });
  await admin.auth.admin.createUser({ id: uidC, email: `m7a2-c-${runId}@test.local`, password: PASSWORD, email_confirm: true });
  await admin.rpc("admin_grant_role", { p_user_id: uidC, p_role: "admin" });
  userA = await signIn(`m7a2-a-${runId}@test.local`);
  userC = await signIn(`m7a2-c-${runId}@test.local`);

  const cust = await admin
    .from("customers")
    .insert({ profile_id: uidA, name: "Client", phone: `+2137${runId.slice(-8)}` })
    .select("id")
    .single();
  customerId = (cust.data as { id: string }).id;
  const ord = await admin
    .from("orders")
    .insert({
      reference: `TKF-P2-${runId}`,
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
  if (proofId) await admin.from("payment_proofs").delete().eq("id", proofId);
  if (storagePath) await admin.storage.from("payment-proofs").remove([storagePath]);
  if (paymentId) await admin.from("payments").delete().eq("id", paymentId);
  if (orderId) await admin.from("orders").delete().eq("id", orderId);
  if (customerId) await admin.from("customers").delete().eq("id", customerId);
  await admin.from("user_roles").delete().eq("user_id", uidC);
  for (const uid of [uidA, uidC]) await admin.auth.admin.deleteUser(uid).catch(() => undefined);
});

describe("payment_proofs — RLS (lecture admin, écriture serveur seule)", () => {
  it("anon : SELECT refusé (aucun grant) ; INSERT refusé", async () => {
    const sel = await anon.from("payment_proofs").select("id");
    expect(sel.error).not.toBeNull();
    expect(sel.data ?? []).toEqual([]);
    const ins = await anon.from("payment_proofs").insert({
      payment_id: paymentId,
      order_id: orderId,
      txn_reference: "00000099",
      mime_type: null,
      size_bytes: null,
    });
    expect(ins.error).not.toBeNull();
    expect(JSON.stringify(ins.error)).toContain("42501");
  });

  it("client authentifié : SELECT 0 ligne ; un client ne lit JAMAIS une preuve", async () => {
    const sel = await userA.from("payment_proofs").select("id");
    expect(sel.error).toBeNull();
    expect(sel.data ?? []).toEqual([]);
  });

  it("admin : lecture OK (pré-insertion service role) ; preuve SANS capture acceptée", async () => {
    const ins = await admin
      .from("payment_proofs")
      .insert({
        payment_id: paymentId,
        order_id: orderId,
        txn_reference: "TR-2026-0001",
        object_path: null,
        mime_type: null,
        size_bytes: null,
      })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    proofId = (ins.data as { id: string }).id;
    const sel = await userC.from("payment_proofs").select("id").eq("id", proofId);
    expect(sel.data?.length).toBe(1);
  });

  it("storage : bucket privé, upload service role, URL signée créée, AUCUN accès public", async () => {
    storagePath = `${orderId}/e2e-proof.webp`;
    const bytes = new TextEncoder().encode("E2E-PROOF-BYTES");
    const up = await admin.storage.from("payment-proofs").upload(storagePath, bytes, {
      contentType: "image/webp",
    });
    expect(up.error).toBeNull();

    const signed = await admin.storage.from("payment-proofs").createSignedUrl(storagePath, 300);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toContain("sign");

    const blob = await fetch(`${env.apiUrl}/storage/v1/object/${storagePath}`);
    // bucket privé : sans jeton, la lecture directe est refusée
    expect(blob.status).toBeGreaterThanOrEqual(400);
  });

  it("transition pending → verifying via RPC (acteur system), journal non-null", async () => {
    const r = await admin.rpc("transition_payment", {
      p_payment_id: paymentId,
      p_to_status: "verifying",
      p_actor_role: "system",
      p_actor_id: null,
      p_reason: "preuve_soumise",
      p_provider_event_id: `proof:${proofId}`,
    });
    expect(r.error).toBeNull();
    const res = r.data as { from: string; to: string; order_status: string; result: string };
    expect(res.from).toBe("pending");
    expect(res.to).toBe("verifying");
    expect(res.order_status).toBe("pending_payment");

    const tr = await admin
      .from("payment_transitions")
      .select("payment_id,order_id,from_status,to_status,actor_role,reason")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(tr.data?.[0]?.from_status).toBe("pending");
    expect(tr.data?.[0]?.to_status).toBe("verifying");
    expect(tr.data?.[0]?.actor_role).toBe("system");
    expect(tr.data?.[0]?.reason).toBe("preuve_soumise");
  });
});
