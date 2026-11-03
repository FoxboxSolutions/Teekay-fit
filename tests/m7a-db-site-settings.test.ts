import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";
import { totp } from "./helpers/totp";

/**
 * M7a bloc 1 — paramètres exploitants (site_settings) :
 *  - rien n'est lisible ni modifiable en anonyme ni par un client ;
 *  - lecture = admin uniquement ; écriture = admin ET aal2 (TOTP réel
 *    enrôlé + challengeé par le test) ;
 *  - RPC admin_upsert_setting : whitelist de clés, validation de la fenêtre,
 *    journal audit_logs SANS la valeur (numéro de compte jamais en log).
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const uidA = crypto.randomUUID();
const uidC = crypto.randomUUID();
const uidD = crypto.randomUUID(); // admin aal2
const PASSWORD = `Str0ng-${runId}-pass`;

let admin: SupabaseClient;
let anon: SupabaseClient;
let userAdminNoAal2: SupabaseClient;
let userAdminAal2: SupabaseClient;
let factorId: string;

beforeAll(async () => {
  admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createUser = async (uid: string, email: string) => {
    await admin.auth.admin.createUser({
      id: uid,
      email,
      password: PASSWORD,
      email_confirm: true,
    });
  };
  await createUser(uidA, `m7a-a-${runId}@test.local`);
  await createUser(uidC, `m7a-c-${runId}@test.local`);
  await createUser(uidD, `m7a-d-${runId}@test.local`);

  for (const uid of [uidC, uidD]) {
    const grant = await admin.rpc("admin_grant_role", { p_user_id: uid, p_role: "admin" });
    if (grant.error) throw new Error(grant.error.message);
  }

  const signIn = async (uid: string, email: string) => {
    const c = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`sign-in échoué (${email}) : ${error.message}`);
    return c;
  };
  userAdminNoAal2 = await signIn(uidC, `m7a-c-${runId}@test.local`);

  // admin aal2 : enrôlement TOTP réel + challenge + vérification (code calculé).
  userAdminAal2 = await signIn(uidD, `m7a-d-${runId}@test.local`);
  const enroll = await userAdminAal2.auth.mfa.enroll({ factorType: "totp", friendlyName: "test-m7a" });
  if (enroll.error || !enroll.data) throw new Error(`enroll échoué : ${enroll.error?.message}`);
  factorId = enroll.data.id;
  const secret =
    enroll.data.totp?.secret ??
    (enroll.data as unknown as { totp: { secret: string } }).totp.secret;
  const challenge = await userAdminAal2.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) throw new Error(`challenge échoué : ${challenge.error?.message}`);
  const code = totp(secret);
  const verify = await userAdminAal2.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) throw new Error(`verify échoué : ${verify.error.message}`);
  const refreshed = await userAdminAal2.auth.refreshSession();
  if (refreshed.error) throw new Error(`refresh échoué : ${refreshed.error.message}`);
}, 120_000);

afterAll(async () => {
  for (const key of [
    "baridimob.account",
    "baridimob.bank",
    "baridimob.beneficiary",
    "baridimob.note",
    "payment_window_hours",
    `m7a-test-${runId}`,
  ]) {
    await admin.from("site_settings").delete().eq("key", key);
  }
  for (const uid of [uidA, uidC, uidD]) {
    await admin.auth.admin.deleteUser(uid).catch(() => undefined);
  }
});

describe("site_settings — RLS (lecture admin, écriture admin + aal2)", () => {
  it("anon : SELECT refusé (aucune policy), INSERT refusé", async () => {
    const sel = await anon.from("site_settings").select("key");
    expect(sel.data ?? []).toEqual([]);
    const ins = await anon
      .from("site_settings")
      .insert({ key: "baridimob.account", value: "000" });
    expect(ins.error).not.toBeNull();
  });

  it("client authentifié sans admin : lecture vide, écriture refusée", async () => {
    const c = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await c.auth.signInWithPassword({ email: `m7a-a-${runId}@test.local`, password: PASSWORD });
    const sel = await c.from("site_settings").select("key");
    expect(sel.data ?? []).toEqual([]);
    const ins = await c
      .from("site_settings")
      .insert({ key: "baridimob.account", value: "pirate" });
    expect(ins.error).not.toBeNull();
  });

  it("admin sans aal2 : RPC admin_upsert_setting ⇒ P5001 droit_admin_aal2_requis", async () => {
    const r = await userAdminNoAal2.rpc("admin_upsert_setting", {
      p_key: `m7a-test-${runId}`,
      p_value: "x",
    });
    void r;
    expect((r.error?.message ?? "") + (r.error?.code ?? "")).toMatch(/P5001|droit_admin_aal2_requis/);
  });

  it("admin avec TOTP vérifié (aal2 réel) : upsert OK, audit SANS la valeur, REST direct refusé", async () => {
    const secret = `num-${runId}-secret-compte`; // valeur marquée secrète
    const r = await userAdminAal2.rpc("admin_upsert_setting", {
      p_key: "baridimob.account",
      p_value: secret,
      p_is_secret: true,
    });
    expect(r.error).toBeNull();

    // La valeur est en base (service role).
    const row = await admin.from("site_settings").select("*").eq("key", "baridimob.account").single();
    expect(row.data?.value).toBe(secret);
    expect(row.data?.is_secret).toBe(true);

    // Audit : acteur + action + is_secret — JAMAIS la valeur.
    const audit = await admin
      .from("audit_logs")
      .select("actor_id,action,entity_id,metadata")
      .eq("entity_id", "baridimob.account")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit.error).toBeNull();
    expect(audit.data?.[0]?.action).toBe("site_setting_upsert");
    expect(audit.data?.[0]?.actor_id).toBe(uidD);
    expect(JSON.stringify(audit.data?.[0]?.metadata)).not.toContain(secret);
    expect(JSON.stringify(audit.data?.[0]?.metadata).indexOf("value")).toBe(-1);

    // Écriture directe via REST refusée quel que soit le niveau (design :
    // AUCUN grant table pour authenticated — l'écriture passe uniquement par
    // admin_upsert_setting). aal1 : filtré par policy ; aal2 : la policy
    // passe mais le grant manque ⇒ 42501 privilege denied.
    const upd = await userAdminNoAal2
      .from("site_settings")
      .update({ value: "pirate" })
      .eq("key", "baridimob.account")
      .select("key");
    expect((upd.data ?? []).length).toBe(0);

    const upd2 = await userAdminAal2
      .from("site_settings")
      .update({ value: "via-rest" })
      .eq("key", "baridimob.account")
      .select("key");
    expect((upd2.data ?? []).length).toBe(0);
    expect(upd2.error?.code).toBe("42501"); // grant-level : policy aal2 a bien passé
    // La valeur reste en base, jamais écrasée par la tentative REST.
    const row2 = await admin.from("site_settings").select("value").eq("key", "baridimob.account").single();
    expect(row2.data?.value).toBe(secret);
  });

  it("whitelist : clé inconnue ⇒ P5002 ; fenêtre hors bornes/na ⇒ P5004", async () => {
    const badKey = await userAdminAal2.rpc("admin_upsert_setting", {
      p_key: `m7a-inconnue-${runId}`,
      p_value: "x",
    });
    expect((badKey.error?.message ?? "") + (badKey.error?.code ?? "")).toMatch(/P5002|cle_inconnue/);

    const badWindowA = await userAdminAal2.rpc("admin_upsert_setting", {
      p_key: "payment_window_hours",
      p_value: "0",
    });
    expect((badWindowA.error?.message ?? "") + (badWindowA.error?.code ?? "")).toMatch(/P5004|fenetre_invalide/);

    const badWindowB = await userAdminAal2.rpc("admin_upsert_setting", {
      p_key: "payment_window_hours",
      p_value: "abc",
    });
    expect((badWindowB.error?.message ?? "") + (badWindowB.error?.code ?? "")).toMatch(/P5004|fenetre_invalide/);

    const badWindowC = await userAdminAal2.rpc("admin_upsert_setting", {
      p_key: "payment_window_hours",
      p_value: "721",
    });
    expect((badWindowC.error?.message ?? "") + (badWindowC.error?.code ?? "")).toMatch(/P5004|fenetre_invalide/);
  });

  it("payment_window_hours() : défaut 48 sans ligne, valeur configurée sinon", async () => {
    const before = await admin.rpc("payment_window_hours");
    expect(before.data).toBe(48);
    expect(
      (await userAdminAal2.rpc("admin_upsert_setting", {
        p_key: "payment_window_hours",
        p_value: "72",
      })).error,
    ).toBeNull();
    const after = await admin.rpc("payment_window_hours");
    expect(after.data).toBe(72);
  });
});
