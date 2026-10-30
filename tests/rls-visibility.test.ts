import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

const env = getLocalEnv();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let service: SupabaseClient;
let anon: SupabaseClient;
let user: SupabaseClient;
let admin: SupabaseClient;

let activeId: string;
let inactiveId: string;

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: active } = await service
    .from("offers")
    .insert({ slug: `vis-active-${suffix}`, name: "Actif", offer_type: "starter", price_da: 2000, is_active: true })
    .select("id")
    .single();
  const { data: inactive } = await service
    .from("offers")
    .insert({ slug: `vis-inactive-${suffix}`, name: "Inactif", offer_type: "coaching_online", price_da: 5000, is_active: false })
    .select("id")
    .single();
  if (!active || !inactive) throw new Error("seed offres échoué");
  activeId = active.id;
  inactiveId = inactive.id;

  await service
    .from("capacity_slots")
    .insert({ offer_id: activeId, slot_date: `2030-02-${String((suffix.length % 20) + 1).padStart(2, "0")}`, capacity: 5 });

  const idUser = crypto.randomUUID();
  const idAdmin = crypto.randomUUID();
  for (const [id, email] of [
    [idUser, `vis-user-${suffix}@test.local`],
    [idAdmin, `vis-admin-${suffix}@test.local`],
  ] as const) {
    const { error } = await service.auth.admin.createUser({
      id, email, password: `Str0ng-${suffix}-pass`, email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
  }
  const { error: grant } = await service.rpc("admin_grant_role", { p_user_id: idAdmin, p_role: "admin" });
  if (grant) throw new Error(`grant: ${grant.message}`);

  const signIn = async (email: string) => {
    const c = createClient(env.apiUrl, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: `Str0ng-${suffix}-pass` });
    if (error) throw new Error(error.message);
    return c;
  };
  user = await signIn(`vis-user-${suffix}@test.local`);
  admin = await signIn(`vis-admin-${suffix}@test.local`);
}, 120_000);

describe("visibilité — visiteur anonyme", () => {
  it("voit l'offre active", async () => {
    const { data } = await anon.from("offers").select("id, is_active");
    expect((data ?? []).map((o) => o.id)).toContain(activeId);
  });

  it("ne voit JAMAIS l'offre inactive", async () => {
    const { data, error } = await anon.from("offers").select("id");
    expect(error).toBeNull();
    expect((data ?? []).map((o) => o.id)).not.toContain(inactiveId);
  });

  it("voit capacity_slots (places restantes réelles)", async () => {
    const { data, error } = await anon.from("capacity_slots").select("id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("visibilité — client connecté non-admin", () => {
  it("voit l'offre active", async () => {
    const { data } = await user.from("offers").select("id");
    expect((data ?? []).map((o) => o.id)).toContain(activeId);
  });

  it("ne voit pas l'offre inactive (seulement les actives)", async () => {
    const { data } = await user.from("offers").select("id");
    expect((data ?? []).map((o) => o.id)).not.toContain(inactiveId);
  });

  it("voit capacity_slots", async () => {
    const { data } = await user.from("capacity_slots").select("id");
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("visibilité — administrateur", () => {
  it("voit les offres actives ET inactives", async () => {
    const { data } = await admin.from("offers").select("id");
    const ids = (data ?? []).map((o) => o.id);
    expect(ids).toContain(activeId);
    expect(ids).toContain(inactiveId);
  });

  it("voit capacity_slots", async () => {
    const { data } = await admin.from("capacity_slots").select("id");
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

afterAll(async () => {
  await service.from("capacity_slots").delete().eq("offer_id", activeId);
  await service.from("offers").delete().in("id", [activeId, inactiveId]);
  for (const email of [`vis-user-${suffix}@test.local`, `vis-admin-${suffix}@test.local`]) {
    const { data } = await service.auth.admin.listUsers({});
    const found = (data?.users ?? []).find((u) => u.email === email);
    if (found) await service.auth.admin.deleteUser(found.id);
  }
});
