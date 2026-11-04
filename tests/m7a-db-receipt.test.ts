import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M7a bloc 6 — DB reçu de paiement (lecture relationnelle réelle) :
 *  - commande NON confirmée (pending_payment) ⇒ PAS de reçu (found false) ;
 *  - après transition pending→verifying→confirmed (RPC, acteur system) :
 *    le reçu porte EXACTEMENT la copie figée (référence, article, montant
 *    total figés, client) et la date de la transition confirmed ;
 *  - PDF généré réel (octets %PDF-).
 */

const env = getLocalEnv();
// La lib du reçu construit son client via src/lib/supabase/admin :
// variables hereby avant l'import dynamique (module cache client).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.apiUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.serviceRoleKey;

const runId = `${Date.now()}`;
const uidA = crypto.randomUUID();
const PASSWORD = `Str0ng-${runId}-pass`;

let admin: SupabaseClient;

let customerId: string;
let orderId: string;
let paymentId: string;

let generateOrderReceipt: typeof import("@/lib/payments/receipt").generateOrderReceipt;

beforeAll(async () => {
  ({ generateOrderReceipt } = await import("@/lib/payments/receipt"));
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.auth.admin.createUser({ id: uidA, email: `m7a6-a-${runId}@test.local`, password: PASSWORD, email_confirm: true });

  const cust = await admin
    .from("customers")
    .insert({
      profile_id: uidA,
      name: "Yacine B.",
      phone: `+2137${runId.slice(-8)}`,
      email: `m7a6-a-${runId}@test.local`,
    })
    .select("id")
    .single();
  customerId = (cust.data as { id: string }).id;
  const ord = await admin
    .from("orders")
    .insert({
      reference: `TKF-P6-${runId}`,
      customer_id: customerId,
      offer_slug: "online",
      offer_name: "Coaching Online",
      unit_price_da: 4200,
      discount_da: 400,
      total_da: 3800,
    })
    .select("id")
    .single();
  orderId = (ord.data as { id: string }).id;
  await admin.from("order_items").insert({
    order_id: orderId,
    offer_slug: "online",
    offer_name: "Coaching Online",
    unit_price_da: 4200,
    quantity: 1,
    subtotal_da: 4200,
  });
  const pay = await admin
    .from("payments")
    .insert({ order_id: orderId, provider: "fake", amount_da: 3800, status: "pending" })
    .select("id")
    .single();
  paymentId = (pay.data as { id: string }).id;
}, 120_000);

afterAll(async () => {
  if (paymentId) await admin.from("payments").delete().eq("id", paymentId);
  if (orderId) await admin.from("orders").delete().eq("id", orderId);
  if (customerId) await admin.from("customers").delete().eq("id", customerId);
  await admin.auth.admin.deleteUser(uidA).catch(() => undefined);
});

describe("reçu — copie figée depuis la base réelle", () => {
  it("commande pas encore confirmée ⇒ PAS de reçu (found=false)", async () => {
    const before = await generateOrderReceipt(orderId);
    expect(before.found).toBe(false);
  });

  it("TEST NOMMÉ : après confirmation, le reçu porte exactement la copie figée (montant, article, client)", async () => {
    const t1 = await admin.rpc("transition_payment", {
      p_payment_id: paymentId,
      p_to_status: "verifying",
      p_actor_role: "system",
      p_actor_id: null,
      p_reason: "preuve_soumise",
      p_provider_event_id: `proof:${paymentId}`,
    });
    expect(t1.error).toBeNull();
    const t2 = await admin.rpc("transition_payment", {
      p_payment_id: paymentId,
      p_to_status: "confirmed",
      p_actor_role: "admin",
      p_actor_id: null,
      p_reason: "montant_recu_verifie",
      p_provider_event_id: `receipt:${paymentId}`,
    });
    expect(t2.error).toBeNull();

    const receipt = await generateOrderReceipt(orderId);
    expect(receipt.found).toBe(true);
    if (!receipt.found) return;

    expect(receipt.copy.reference).toBe(`TKF-P6-${runId}`);
    expect(receipt.copy.offerName).toBe("Coaching Online");
    expect(receipt.copy.unitPriceDa).toBe(4200);
    expect(receipt.copy.discountDa).toBe(400);
    expect(receipt.copy.totalDa).toBe(3800);
    expect(receipt.copy.customerName).toBe("Yacine B.");
    expect(receipt.copy.customerEmail).toBe(`m7a6-a-${runId}@test.local`);
    expect(receipt.copy.paidAtIso).toBeTruthy();

    const byLabel = new Map(receipt.lines.map((l) => [l.label, l.value]));
    expect(byLabel.get("Titre")).toBe("REÇU");
    expect(byLabel.get("Référence")).toBe(`TKF-P6-${runId}`);
    expect(byLabel.get("Remise")).toContain("400");
    expect(byLabel.get("TOTAL PAYÉ")).toContain(" 800 DA");

    expect(receipt.pdf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
