import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";
import { resolveDownloadGrant } from "../src/lib/files/entitlements";

/**
 * M8 (bloc 2b) — Résolution du droit de téléchargement, TOUJOURS en 404
 * neutre (un seul type d'échec, aucun oracle d'existence) :
 *  - sans session ⇒ échec ;
 *  - entitlement d'un AUTRE client ⇒ échec ;
 *  - commande non confirmée (pending/cancelled/refunded) ⇒ échec ;
 *  - droit révoqué ou EXPIRÉ ⇒ échec ;
 *  - identifiant deviné (uuid au hasard ou malformé) ⇒ échec ;
 *  - fichier d'une AUTRE offre ⇒ échec ;
 *  - droit valide (session + payé + non révoqué + non expiré) ⇒ grant
 *    avec les fichiers de l'offre, nom et téléphone pour le filigrane.
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;

let admin: SupabaseClient;
const cleanup: {
  offers: string[];
  files: string[];
  customers: string[];
  orders: string[];
  items: string[];
  entitlements: string[];
  users: string[];
} = { offers: [], files: [], customers: [], orders: [], items: [], entitlements: [], users: [] };

let ownerUserId: string;
let otherUserId: string;
let offerId: string;
let otherOfferId: string;
let fileId: string;
let otherFileId: string;
let validEntitlementId: string;

async function buildOrder(opts: {
  status: string;
  revoked?: boolean;
  expiresAt?: string;
}): Promise<{ entitlementId: string; orderId: string }> {
  // customers.email est UNIQUE (exact) : une ligne par appel.
  const cust = await admin
    .from("customers")
    .insert({
      name: "Client M8",
      email: `m8ent-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      profile_id: ownerUserId,
    })
    .select("id")
    .single();
  if (cust.error) throw new Error(`customers insert: ${JSON.stringify(cust.error)}`);
  const customerId = (cust.data as { id: string }).id;
  cleanup.customers.push(customerId);

  const ord = await admin
    .from("orders")
    .insert({
      reference: `TKF-M8E-${runId}-${Math.random().toString(36).slice(2, 5)}`,
      customer_id: customerId,
      offer_id: offerId,
      offer_slug: "starter",
      offer_name: "Starter",
      unit_price_da: 2000,
      discount_da: 0,
      total_da: 2000,
      status: opts.status,
    })
    .select("id")
    .single();
  const orderId = (ord.data as { id: string }).id;
  cleanup.orders.push(orderId);

  const item = await admin
    .from("order_items")
    .insert({
      order_id: orderId,
      offer_id: offerId,
      offer_slug: "starter",
      offer_name: "Starter",
      unit_price_da: 2000,
      subtotal_da: 2000,
    })
    .select("id")
    .single();
  const itemId = (item.data as { id: string }).id;
  cleanup.items.push(itemId);

  const ent = await admin
    .from("entitlements")
    .insert({
      order_item_id: itemId,
      order_id: orderId,
      ...(opts.revoked ? { revoked_at: new Date().toISOString() } : {}),
      ...(opts.expiresAt ? { expires_at: opts.expiresAt } : {}),
    })
    .select("id")
    .single();
  const entitlementId = (ent.data as { id: string }).id;
  cleanup.entitlements.push(entitlementId);
  return { entitlementId, orderId };
}

beforeAll(async () => {
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // La lib server-only lit les env du service-role au premier appel.
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;

  const a = await admin.auth.admin.createUser({
    email: `m8ent-a-${runId}@test.local`,
    email_confirm: true,
  });
  ownerUserId = a.data?.user?.id as string;
  cleanup.users.push(ownerUserId);
  const b = await admin.auth.admin.createUser({
    email: `m8ent-b-${runId}@test.local`,
    email_confirm: true,
  });
  otherUserId = b.data?.user?.id as string;
  cleanup.users.push(otherUserId);

  const off = await admin
    .from("offers")
    .insert({ slug: `m8-ent-${runId}`, name: "Starter", offer_type: "starter", price_da: 2000, is_active: true })
    .select("id")
    .single();
  offerId = (off.data as { id: string }).id;
  cleanup.offers.push(offerId);
  const off2 = await admin
    .from("offers")
    .insert({ slug: `m8-other-${runId}`, name: "Autre", offer_type: "starter", price_da: 1000, is_active: true })
    .select("id")
    .single();
  otherOfferId = (off2.data as { id: string }).id;
  cleanup.offers.push(otherOfferId);

  const f1 = await admin
    .from("offer_files")
    .insert({ offer_id: offerId, storage_path: `starter/m8-${runId}-a.pdf`, label: "Programme A" })
    .select("id")
    .single();
  fileId = (f1.data as { id: string }).id;
  cleanup.files.push(fileId);
  const f2 = await admin
    .from("offer_files")
    .insert({ offer_id: otherOfferId, storage_path: `other/m8-${runId}-b.pdf`, label: "Programme B" })
    .select("id")
    .single();
  otherFileId = (f2.data as { id: string }).id;
  cleanup.files.push(otherFileId);

  const valid = await buildOrder({ status: "paid" });
  validEntitlementId = valid.entitlementId;
}, 120_000);

afterAll(async () => {
  if (!admin) return;
  await admin.from("entitlements").delete().in("id", cleanup.entitlements);
  await admin.from("order_items").delete().in("id", cleanup.items);
  await admin.from("orders").delete().in("id", cleanup.orders);
  await admin.from("customers").delete().in("id", cleanup.customers);
  await admin.from("offer_files").delete().in("id", cleanup.files);
  await admin.from("offers").delete().in("id", cleanup.offers);
  for (const id of cleanup.users) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe("M8 bloc 2b — résolution du droit (404 neutre partout)", () => {
  it("TEST NOMMÉ : sans session ou avec l'entitlement d'UN AUTRE client ⇒ échec identique (aucune existence révélée)", async () => {
    const noSession = await resolveDownloadGrant({
      userId: null,
      entitlementId: validEntitlementId,
    });
    expect(noSession.ok).toBe(false);

    const otherClient = await resolveDownloadGrant({
      userId: otherUserId,
      entitlementId: validEntitlementId,
    });
    expect(otherClient.ok).toBe(false);
    // Même forme d'échec : AUCUNE information (pas de grant, pas de motif).
    expect(JSON.stringify(noSession)).toBe(JSON.stringify(otherClient));
  });

  it("commande NON confirmée (pending, cancelled, refunded) ⇒ aucun droit ouvert", async () => {
    for (const status of ["pending_payment", "cancelled", "refunded"]) {
      const built = await buildOrder({ status });
      const res = await resolveDownloadGrant({
        userId: ownerUserId,
        entitlementId: built.entitlementId,
      });
      expect(res.ok, `statut ${status} ne doit rien ouvrir`).toBe(false);
    }
  });

  it("droit RÉVOQUÉ ou EXPIRÉ ⇒ échec (jamais présenté comme actif) ; futur ⇒ valide", async () => {
    const revoked = await buildOrder({ status: "paid", revoked: true });
    expect(
      (await resolveDownloadGrant({ userId: ownerUserId, entitlementId: revoked.entitlementId })).ok,
    ).toBe(false);

    const expired = await buildOrder({
      status: "paid",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(
      (await resolveDownloadGrant({ userId: ownerUserId, entitlementId: expired.entitlementId })).ok,
    ).toBe(false);

    const future = await buildOrder({
      status: "paid",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(
      (await resolveDownloadGrant({ userId: ownerUserId, entitlementId: future.entitlementId })).ok,
    ).toBe(true);
  });

  it("identifiant DEVINÉ (uuid aléatoire ou malformé) ⇒ échec identique, sans requête révélante", async () => {
    const random = await resolveDownloadGrant({
      userId: ownerUserId,
      entitlementId: crypto.randomUUID(),
    });
    expect(random.ok).toBe(false);

    const malformed = await resolveDownloadGrant({
      userId: ownerUserId,
      entitlementId: "pas-un-uuid-1234567890",
    });
    expect(malformed.ok).toBe(false);
    expect(JSON.stringify(random)).toBe(JSON.stringify(malformed));
  });

  it("fichier d'une AUTRE offre (demandé par identifiant) ⇒ échec ; fichier de l'offre ⇒ grant complet", async () => {
    const wrongFile = await resolveDownloadGrant({
      userId: ownerUserId,
      entitlementId: validEntitlementId,
      fileId: otherFileId,
    });
    expect(wrongFile.ok).toBe(false);

    const good = await resolveDownloadGrant({
      userId: ownerUserId,
      entitlementId: validEntitlementId,
      fileId,
    });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    // Grant complet : référence de commande, fichiers, données filigrane
    // (nom + téléphone — masqué à l'affichage, jamais le numéro complet).
    expect(good.grant.reference).toContain("TKF-M8E-");
    expect(good.grant.clientName).toBe("Client M8");
    expect(good.grant.files).toHaveLength(1);
    expect(good.grant.files[0]?.storagePath).toContain(`m8-${runId}-a.pdf`);

    // Sans fichier imposé : tous les fichiers de l'offre sont listés.
    const all = await resolveDownloadGrant({
      userId: ownerUserId,
      entitlementId: validEntitlementId,
    });
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.grant.files.length).toBeGreaterThanOrEqual(1);
  });
});
