import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

const env = getLocalEnv();

let admin: SupabaseClient;
let userA: SupabaseClient;
let userB: SupabaseClient;
let userC: SupabaseClient;

const uidA = crypto.randomUUID();
const uidB = crypto.randomUUID();
const uidC = crypto.randomUUID();
const suffix = Date.now();

let orderOfB: string;
let leadOfB: string;

beforeAll(async () => {
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Trois comptes : A et B = clients, C = futur admin.
  await admin.auth.admin.createUser({
    id: uidA,
    email: `rls-a-${suffix}@test.local`,
    password: `Str0ng-${suffix}-pass`,
    email_confirm: true,
  });
  await admin.auth.admin.createUser({
    id: uidB,
    email: `rls-b-${suffix}@test.local`,
    password: `Str0ng-${suffix}-pass`,
    email_confirm: true,
  });
  await admin.auth.admin.createUser({
    id: uidC,
    email: `rls-c-${suffix}@test.local`,
    password: `Str0ng-${suffix}-pass`,
    email_confirm: true,
  });

  // Données de B (commande payée + lead) : A ne doit jamais les voir.
  const { data: customer } = await admin
    .from("customers")
    .insert({ profile_id: uidB, name: "Client B", phone: `+213${suffix}` })
    .select("id")
    .single();
  if (!customer) throw new Error("création customer B échouée");

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      reference: `TKF-TEST-${suffix}`,
      customer_id: customer.id,
      offer_slug: "starter",
      offer_name: "Starter",
      unit_price_da: 2000,
      total_da: 2000,
      status: "paid",
    })
    .select("id")
    .single();
  if (orderError || !order) throw new Error(`création commande B échouée: ${orderError?.message}`);
  orderOfB = order.id;

  const { data: lead } = await admin
    .from("leads")
    .insert({
      name: "Lead B",
      phone: `+213${suffix}55`,
      phone_norm: `+213${suffix}55`,
      source: "site",
      consent: true,
      consent_at: new Date().toISOString(),
      notes: "note confidentielle CRM B",
    })
    .select("id")
    .single();
  if (!lead) throw new Error("création lead B échouée");
  leadOfB = lead.id;

  // C devient admin via la RPC auditéée.
  const { error: grantError } = await admin.rpc("admin_grant_role", {
    p_user_id: uidC,
    p_role: "admin",
  });
  if (grantError) throw new Error(`grant admin échoué: ${grantError.message}`);

  // Sessions clients (JWT utilisateur — RLS s'applique).
  const signIn = async (id: number, email: string) => {
    const client = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email,
      password: `Str0ng-${suffix}-pass`,
    });
    if (error) throw new Error(`sign-in échoué: ${error.message}`);
    return client;
  };

  userA = await signIn(1, `rls-a-${suffix}@test.local`);
  userB = await signIn(2, `rls-b-${suffix}@test.local`);
  userC = await signIn(3, `rls-c-${suffix}@test.local`);
}, 120_000);

afterAll(async () => {
  for (const id of [uidA, uidB, uidC]) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe("RLS — un client ne lit jamais les données d'un autre", () => {
  it("A ne voit pas le profil de B", async () => {
    const { data } = await userA.from("profiles").select("id");
    expect((data ?? []).map((row) => row.id)).not.toContain(uidB);
    expect((data ?? []).map((row) => row.id)).toContain(uidA);
  });

  it("A ne voit aucune commande de B", async () => {
    const { data } = await userA.from("orders").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("B voit exactement sa propre commande", async () => {
    const { data } = await userB.from("orders").select("id");
    expect((data ?? []).map((row) => row.id)).toEqual([orderOfB]);
  });

  it("A ne voit pas les lignes de commande de B", async () => {
    const { data } = await userA.from("order_items").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("A ne voit ni le lead, ni ses notes CRM", async () => {
    const { data } = await userA.from("leads").select("id, notes");
    expect(data ?? []).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("confidentielle");
  });

  it("A ne voit pas les consentements de B", async () => {
    const { data } = await userA.from("consents").select("id");
    expect(data ?? []).toEqual([]);
  });
});

describe("RLS — tables admin : un non-admin ne lit ni n'écrit", () => {
  it("A ne lit aucun lead (table admin)", async () => {
    const { data } = await userA.from("leads").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("A ne lit aucun entrée du journal d'audit", async () => {
    const { data } = await userA.from("audit_logs").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("A ne lit aucun code promo", async () => {
    const { data } = await userA.from("promo_codes").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("A ne lit aucun fichier d'offre (stockage privé)", async () => {
    const { data } = await userA.from("offer_files").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("A ne peut pas insérer un lead", async () => {
    const { error } = await userA
      .from("leads")
      .insert({ name: "intrus", source: "site", consent: false });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("A ne peut pas insérer dans audit_logs", async () => {
    const { error } = await userA.from("audit_logs").insert({ action: "forged" });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("L'admin C lit les tables admin", async () => {
    const { data: leads } = await userC.from("leads").select("id");
    expect((leads ?? []).some((row) => row.id === leadOfB)).toBe(true);

    const { data: audits } = await userC.from("audit_logs").select("id, action");
    expect((audits ?? []).some((row) => row.action === "role.grant")).toBe(true);
  });
});

describe("RLS — impossible de s'attribuer un rôle", () => {
  it("A ne peut pas s'inscrire comme admin (INSERT refusé)", async () => {
    const { error } = await userA
      .from("user_roles")
      .insert({ user_id: uidA, role: "admin" });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("A ne peut pas mettre à jour ses rôles (UPDATE refusé)", async () => {
    const { data, error } = await userA
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", uidA);
    // Aucune permission d'écriture accordée → 42501, zéro ligne modifiée.
    if (error) {
      expect(error.code).toBe("42501");
    } else {
      expect(data ?? []).toEqual([]);
    }
    // Vérification finale : A n'a toujours pas le rôle admin.
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", uidA);
    expect((roles ?? []).map((row) => row.role)).not.toContain("admin");
  });

  it("La RPC admin_grant_role refuse un appel non-admin", async () => {
    const { error } = await userA.rpc("admin_grant_role", {
      p_user_id: uidA,
      p_role: "admin",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("non autorisé");
  });

  it("A ne voit pas le rôle admin de C", async () => {
    const { data } = await userA
      .from("user_roles")
      .select("user_id, role");
    expect((data ?? []).some((row) => row.user_id === uidC)).toBe(false);
  });

  it("C (admin) peut se révoquer — révocation auditable", async () => {
    const { error } = await userC.rpc("admin_revoke_role", {
      p_user_id: uidC,
      p_role: "admin",
    });
    expect(error).toBeNull();

    // La trace est vérifiée en service-role : C n'est plus admin et ne lit
    // donc plus audit_logs avec sa propre session.
    const { data: audits } = await admin
      .from("audit_logs")
      .select("action")
      .eq("action", "role.revoke");
    expect((audits ?? []).length).toBeGreaterThan(0);

    // Après révocation, C perd l'accès admin côté client.
    const { data: leads } = await userC.from("leads").select("id");
    expect(leads ?? []).toEqual([]);

    // Remettre C admin (service-role) pour la suite.
    await admin.rpc("admin_grant_role", { p_user_id: uidC, p_role: "admin" });
  });
});

describe("audit_logs — en ajout seul (y compris service-role)", () => {
  it("UPDATE est bloqué par le trigger, même en service-role", async () => {
    const { data: inserted } = await admin
      .from("audit_logs")
      .insert({ action: "test.append_only" })
      .select("id")
      .single();
    expect(inserted).not.toBeNull();

    const { error } = await admin
      .from("audit_logs")
      .update({ action: "tampered" })
      .eq("id", inserted!.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("ajout seul");
  });

  it("DELETE est bloqué par le trigger, même en service-role", async () => {
    const { data: inserted } = await admin
      .from("audit_logs")
      .insert({ action: "test.append_only_delete" })
      .select("id")
      .single();

    const { error } = await admin.from("audit_logs").delete().eq("id", inserted!.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("ajout seul");
  });
});

describe("aptitude_questionnaires — accès restreint (données de santé)", () => {
  it("A ne voit aucun questionnaire, même avec la table lisible", async () => {
    const { data } = await userA.from("aptitude_questionnaires").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("L'admin accède aux questionnaires", async () => {
    const { data } = await userC.from("aptitude_questionnaires").select("id");
    expect(Array.isArray(data)).toBe(true);
  });
});
