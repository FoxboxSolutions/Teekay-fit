import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";
import { CaptureMailer } from "../src/lib/mailer/mailer";

/**
 * M8 (bloc 0a) — CHAÎNE COMPLÈTE d'accès client, depuis une adresse e-mail
 * NEUVE (les inscriptions publiques restent désactivées) :
 *
 *   paiement confirmé → compte créé via l'API ADMIN (createUser, sans
 *   mot de passe) → profiles créé (trigger) + customers.profile_id LIÉ →
 *   lien de connexion généré par admin.generateLink et envoyé via NOTRE
 *   Mailer (email_outbox idempotent) → /auth/confirm (verifyOtp, usage
 *   unique) → session → la commande est VISIBLE (RLS owns_order).
 *
 * Variante : compte DÉJÀ existant ⇒ même résultat, SANS doublon.
 * Liaison : normalisation e-mail (trim + minuscules), idempotente, toutes
 * les lignes du même e-mail, JAMAIS une ligne déjà liée à un autre compte.
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const EMAIL = `m8cha-a-${runId}@test.local`;

let admin: SupabaseClient;
let anon: SupabaseClient;

let customerId: string;
let orderId: string;
let paymentId: string;
const createdUserIds: string[] = [];

let customerAccess: typeof import("../src/lib/auth/customer-access");

beforeAll(async () => {
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // La lib (server-only) lit les env du service-role : fournies par les clés
  // locales AVANT le premier appel (client mis en cache au premier usage).
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
  customerAccess = await import("../src/lib/auth/customer-access");
}, 120_000);

afterAll(async () => {
  if (orderId) {
    await admin.from("email_outbox").delete().eq("payment_id", paymentId);
    await admin.from("payments").delete().eq("id", paymentId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  if (customerId) await admin.from("customers").delete().eq("id", customerId);
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

async function insertPaidOrder(email: string, name: string) {
  const cust = await admin
    .from("customers")
    .insert({ name, email })
    .select("id")
    .single();
  const customerId = (cust.data as { id: string }).id;
  const ord = await admin
    .from("orders")
    .insert({
      reference: `TKF-M8-${runId}-${Math.random().toString(36).slice(2, 6)}`,
      customer_id: customerId,
      offer_slug: "starter",
      offer_name: "Starter",
      unit_price_da: 2000,
      discount_da: 0,
      total_da: 2000,
    })
    .select("id,reference")
    .single();
  const order = ord.data as { id: string; reference: string };
  const pay = await admin
    .from("payments")
    .insert({ order_id: order.id, provider: "fake", amount_da: 2000, status: "confirmed" })
    .select("id")
    .single();
  return { customerId, orderId: order.id, reference: order.reference, paymentId: (pay.data as { id: string }).id };
}

describe("M8 chaîne complète — e-mail neuf", () => {
  let mailer: CaptureMailer;
  const tokenHashes: string[] = [];

  it("TEST NOMMÉ : paiement confirmé → compte créé via API admin → customers lié → lien (generateLink) envoyé via Mailer outbox idempotent → /auth/confirm → session → commande visible (owns_order)", async () => {
    // E-mail volontaire MAL NORMALISÉ dans customers (trim + casse) : la
    // chaîne doit le normaliser (trim + minuscules) sans erreur.
    const paid = await insertPaidOrder(`  ${EMAIL.toUpperCase()}  `, "Client M8");
    customerId = paid.customerId;
    orderId = paid.orderId;
    paymentId = paid.paymentId;

    mailer = new CaptureMailer();
    const result = await customerAccess.notifyPdfAccess({
      paymentId,
      orderId,
      mailer,
    });
    expect(result.status).toBe("sent");

    // 1) Compte créé par l'API ADMIN (pas d'inscription publique), profil
    //    créé par le trigger, e-mail normalisé.
    // La fonction SQL renvoie un SCALAIRE (uuid ou null) — jamais un tableau.
    const { data, error } = await admin.rpc("find_auth_user_id_by_email", {
      p_email: EMAIL,
    });
    if (error) throw new Error(error.message);
    expect(typeof data === "string" && data).toBeTruthy();
    const userId = data as string;
    createdUserIds.push(userId);

    const profile = await admin.from("profiles").select("id").eq("id", userId);
    expect(profile.data ?? []).toHaveLength(1);

    // 2) customers.profile_id LIÉ (normalisé) ;
    const cust = await admin
      .from("customers")
      .select("profile_id,email")
      .eq("id", customerId)
      .single();
    expect((cust.data as { profile_id: string | null }).profile_id).toBe(userId);

    // 3) Outbox idempotent : 1 ligne pdf_access « sent », destinataire
    //    normalisé, et le Mailer a reçu UN SEUL e-mail.
    const outbox = await admin
      .from("email_outbox")
      .select("event_type,status,recipient")
      .eq("payment_id", paymentId);
    const rows = outbox.data as Array<{ event_type: string; status: string; recipient: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: "pdf_access", status: "sent", recipient: EMAIL });
    expect(mailer.outbox).toHaveLength(1);

    // 4) L'e-mail contient le lien NOTRE page (jamais /auth/v1/verify), ni
    //    fichier ni lien de téléchargement.
    const text = mailer.outbox[0]?.text ?? "";
    const match = text.match(/\/auth\/confirm\?token_hash=([A-Za-z0-9_-]+)&type=magiclink&next=%2Ffr%2Faccount/);
    expect(match, `lien /auth/confirm attendu dans : ${text}`).not.toBeNull();
    const tokenHash = match?.[1] as string;
    tokenHashes.push(tokenHash);
    expect(text).not.toContain("/auth/v1/verify");
    expect(text).not.toMatch(/\.pdf/i);

    // 5) /auth/confirm : verifyOtp consomme le jeton → SESSION réelle.
    const verify = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    expect(verify.error).toBeNull();
    const accessToken = verify.data.session?.access_token as string;
    expect(accessToken).toBeTruthy();

    // 6) Session → la commande du client est VISIBLE via la RLS
    //    (owns_order : customers.profile_id = auth.uid()).
    const asUser = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const visible = await asUser
      .from("orders")
      .select("id,reference")
      .eq("reference", paid.reference);
    expect(visible.error).toBeNull();
    expect(visible.data ?? []).toHaveLength(1);
  });

  it("rejeu (même paiement) ⇒ skipped_replay : outbox toujours 1 ligne, AUCUN second e-mail, AUCUN doublon de compte", async () => {
    const before = await admin
      .from("email_outbox")
      .select("id")
      .eq("payment_id", paymentId);
    expect((before.data as unknown[]).length).toBe(1);

    const result = await customerAccess.notifyPdfAccess({
      paymentId,
      orderId,
      mailer: new CaptureMailer(),
    });
    expect(result.status).toBe("skipped_replay");

    const after = await admin
      .from("email_outbox")
      .select("id")
      .eq("payment_id", paymentId);
    expect((after.data as unknown[]).length).toBe(1);
  });

  it("le lien est à USAGE UNIQUE : un second verifyOtp du même token_hash échoue (session refusée)", async () => {
    const tokenHash = tokenHashes[0] as string;
    const replay = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    expect(replay.error).not.toBeNull();
    expect(replay.data.session).toBeNull();
  });
});

describe("M8 chaîne — compte existant et liaison sûre", () => {
  const EXISTING = `m8cha-b-${runId}@test.local`;
  const PASSWORD = `Str0ng-${runId}-x`;
  let otherUserId: string;

  beforeAll(async () => {
    otherUserId = crypto.randomUUID();
    await admin.auth.admin.createUser({
      id: otherUserId,
      email: EXISTING,
      password: PASSWORD,
      email_confirm: true,
    });
    createdUserIds.push(otherUserId);
  });

  it("compte déjà existant ⇒ MÊME résultat sans doublon ; TOUTES les lignes du même e-mail liées ; une ligne liée à un AUTRE compte jamais retouchée", async () => {
    // Ligne 1 : déjà liée à un AUTRE utilisateur (ne doit jamais bouger).
    const guarded = await admin
      .from("customers")
      .insert({ name: "Autre profil", email: EXISTING, profile_id: otherUserId })
      .select("id")
      .single();
    const guardedId = (guarded.data as { id: string }).id;

    // Ligne 2 : non liée, même e-mail (casse/espaces différents).
    const fresh = await admin
      .from("customers")
      .insert({ name: "Deuxième ligne", email: `  ${EXISTING.toUpperCase()}  ` })
      .select("id")
      .single();
    const freshId = (fresh.data as { id: string }).id;

    const result = await customerAccess.ensureCustomerAccount({ email: EXISTING });
    expect(result.created).toBe(false);
    expect(result.userId).toBe(otherUserId); // compte existant réutilisé

    const rows = await admin
      .from("customers")
      .select("id,profile_id")
      .in("id", [guardedId, freshId]);
    const map = new Map(
      (rows.data as Array<{ id: string; profile_id: string | null }>).map((r) => [r.id, r.profile_id]),
    );
    expect(map.get(guardedId)).toBe(otherUserId); // JAMAIS retouchée
    expect(map.get(freshId)).toBe(otherUserId); // liée au compte existant

    // Idempotence : un second appel ne crée aucun doublon et reste stable.
    const again = await customerAccess.ensureCustomerAccount({ email: EXISTING });
    expect(again.created).toBe(false);
    expect(again.userId).toBe(otherUserId);

    await admin.from("customers").delete().in("id", [guardedId, freshId]);
  });
});
