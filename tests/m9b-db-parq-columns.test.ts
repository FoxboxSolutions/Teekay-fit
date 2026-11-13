import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";
import { totp } from "./helpers/totp";
import { userRateLimitKey } from "@/lib/security/rate-limit";

/**
 * M9b — verrouillage des COLONNES de réponses PAR-Q (migration
 * 20261113100000_m9b_parq_column_privileges.sql).
 *
 * Défaut prouvé (base locale, données fictives) : les colonnes q1..q7 étaient
 * lisibles directement via l'API REST PostgREST par un admin aal1 (sans MFA),
 * un admin aal2 et un client propriétaire (GRANT SELECT au niveau table,
 * 20261029100100_rls_policies.sql l.456) — sans passer par la route auditée.
 *
 * Un test nommé par exigence :
 *  1. les 3 identités ne peuvent PAS lire les 7 colonnes via REST (403
 *     42501 permission denied) ;
 *  2. les 3 colonnes non sensibles restent lisibles SELON les politiques RLS
 *     existantes (admin = toutes lignes via is_admin ; client = SA ligne via
 *     owns_order, pas celles d'autrui) ;
 *  3. POST /api/admin/par-q fonctionne toujours (service-role) et audite ;
 *  4. la requête exacte de la page clients
 *     (order_id, medical_advice_recommended, created_at) passe encore.
 *
 * Tout est réel : service-role, RLS, GRANT de colonnes, GoTrue (TOTP enrôlé
 * et challengeé). Seul @/lib/auth/session est mocké (test 3) pour alimenter
 * la garde avec l'identité RÉELLE de l'admin aal2 créé par le test.
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const uidAdmin = crypto.randomUUID();
const uidClient = crypto.randomUUID();
const PASSWORD = `Str0ng-${runId}-pass`;

const QCOLS = "q1_heart_condition,q2_exertion_chest_pain,q3_rest_chest_pain,q4_syncope,q5_joint_bone_problem,q6_heart_medication,q7_other_restriction";
const NCOLS = "order_id,medical_advice_recommended,created_at";

// Commande A : propriétaire = client du test. Commande B : autre client.
const customerA = {
  id: crypto.randomUUID(),
  profile_id: uidClient,
  name: "Client A (m9b colonnes)",
  phone: "+213555001111",
  phone_norm: "+213555001111",
  email: `m9b-a-${runId}@test.local`,
};
const customerB = {
  id: crypto.randomUUID(),
  name: "Client B (m9b colonnes)",
  phone: "+213555002222",
  phone_norm: "+213555002222",
  email: `m9b-b-${runId}@test.local`,
};
const orderA = {
  id: crypto.randomUUID(),
  reference: `TKF-M9BCOL-${runId}-A`,
  customer_id: customerA.id,
  status: "paid" as const,
  offer_slug: "starter",
  offer_name: "Starter",
  unit_price_da: 6000,
  discount_da: 0,
  total_da: 6000,
};
const orderB = { ...orderA, id: crypto.randomUUID(), reference: `TKF-M9BCOL-${runId}-B`, customer_id: customerB.id };
const answersA = {
  q1_heart_condition: true,
  q2_exertion_chest_pain: true,
  q3_rest_chest_pain: false,
  q4_syncope: false,
  q5_joint_bone_problem: true,
  q6_heart_medication: false,
  q7_other_restriction: false,
};
const waiver = { waiver_accepted: true, waiver_accepted_at: new Date().toISOString(), waiver_version: "m9b-v1" };

const guardCtx = vi.hoisted(() => ({ auth: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () =>
    guardCtx.auth
      ? { ok: true, auth: guardCtx.auth }
      : { ok: false, status: 401, error: "unauthenticated" },
}));

let service: SupabaseClient;
let post: typeof import("@/app/api/admin/par-q/route").POST;
let jwtAal1: string;
let jwtAal2: string;
let jwtClient: string;
let parqBucket: string;

/** GET REST PostgREST avec la clé publique anon + un JWT propre. */
async function restGet(select: string, orderId: string, jwt: string): Promise<{ status: number; body: string }> {
  const url = `${env.apiUrl}/rest/v1/aptitude_questionnaires?select=${select}&order_id=eq.${orderId}`;
  const res = await fetch(url, { headers: { apikey: env.anonKey, Authorization: `Bearer ${jwt}` } });
  return { status: res.status, body: await res.text() };
}

async function auditsFor(orderId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await service
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, metadata")
    .eq("action", "parq_answers_read")
    .eq("entity_id", orderId);
  if (error) throw new Error(`lecture audit_logs : ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

beforeAll(async () => {
  // Clés visibles au module @/lib/supabase/admin (lu au premier appel).
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;

  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Admin réel : compte + rôle + TOTP enrôlé et vérifié (aal2 atteint).
  const created = await service.auth.admin.createUser({
    id: uidAdmin,
    email: `m9b-admin-${runId}@test.local`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser admin : ${created.error.message}`);
  const grant = await service.rpc("admin_grant_role", { p_user_id: uidAdmin, p_role: "admin" });
  if (grant.error) throw new Error(`admin_grant_role : ${grant.error.message}`);
  const signed = await anon.auth.signInWithPassword({ email: `m9b-admin-${runId}@test.local`, password: PASSWORD });
  if (signed.error) throw new Error(`signIn admin : ${signed.error.message}`);
  jwtAal1 = signed.data.session.access_token;
  const enroll = await anon.auth.mfa.enroll({ factorType: "totp", friendlyName: "m9b-columns" });
  if (enroll.error || !enroll.data) throw new Error(`enroll : ${enroll.error?.message}`);
  const secret = enroll.data.totp?.secret;
  const challenge = await anon.auth.mfa.challenge({ factorId: enroll.data.id });
  if (challenge.error || !challenge.data) throw new Error(`challenge : ${challenge.error?.message}`);
  const verify = await anon.auth.mfa.verify({
    factorId: enroll.data.id,
    challengeId: challenge.data.id,
    code: totp(secret!),
  });
  if (verify.error) throw new Error(`verify : ${verify.error.message}`);
  jwtAal2 =
    (verify.data as unknown as { session?: { access_token: string } })?.session?.access_token ??
    verify.data?.access_token;

  // Client propriétaire de la commande A.
  const createdClient = await service.auth.admin.createUser({
    id: uidClient,
    email: `m9b-client-${runId}@test.local`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createdClient.error) throw new Error(`createUser client : ${createdClient.error.message}`);
  const signedClient = await anon.auth.signInWithPassword({ email: `m9b-client-${runId}@test.local`, password: PASSWORD });
  if (signedClient.error) throw new Error(`signIn client : ${signedClient.error.message}`);
  jwtClient = signedClient.data.session.access_token;

  // Données : A (propriétaire = client) et B (autre client, sans profil).
  const insCustomers = await service.from("customers").insert([customerA, customerB]);
  if (insCustomers.error) throw new Error(`customers : ${insCustomers.error.message}`);
  const insOrders = await service.from("orders").insert([orderA, orderB]);
  if (insOrders.error) throw new Error(`orders : ${insOrders.error.message}`);
  const insApt = await service.from("aptitude_questionnaires").insert([
    { order_id: orderA.id, customer_id: customerA.id, ...answersA, medical_advice_recommended: true, objective: "strength", experience_level: "beginner", ...waiver },
    { order_id: orderB.id, customer_id: customerB.id, ...answersA, q1_heart_condition: false, q7_other_restriction: true, medical_advice_recommended: false, objective: "endurance", experience_level: "beginner", ...waiver },
  ]);
  if (insApt.error) throw new Error(`aptitude_questionnaires : ${insApt.error.message}`);

  // Route chargée APRÈS les variables d'env (createSupabaseAdminClient cache).
  const mod = await import("@/app/api/admin/par-q/route");
  post = mod.POST;
  parqBucket = userRateLimitKey(uidAdmin, "parq_read_user");
}, 120_000);

afterAll(async () => {
  // Nettoyage : aptitude (cascade via orders), orders, customers, compteur.
  // audit_logs : append-only — AUCUNE suppression tentée (reliquats acceptés).
  await service.from("orders").delete().in("id", [orderA.id, orderB.id]);
  await service.from("customers").delete().in("id", [customerA.id, customerB.id]);
  await service.from("rate_limit_counters").delete().eq("bucket_key", parqBucket);
  await service.auth.admin.deleteUser(uidAdmin).catch(() => undefined);
  await service.auth.admin.deleteUser(uidClient).catch(() => undefined);
});

describe("M9b — colonnes PAR-Q verrouillées (migration 20261113100000)", () => {
  it("TEST NOMMÉ (1) : admin aal1, admin aal2 et client propriétaire ne peuvent PAS lire les 7 colonnes de réponses via REST (403 42501 permission denied)", async () => {
    for (const [label, jwt] of [
      ["admin aal1", jwtAal1],
      ["admin aal2", jwtAal2],
      ["client propriétaire", jwtClient],
    ] as [string, string][]) {
      const { status, body } = await restGet(QCOLS, orderA.id, jwt);
      expect(status, `${label} : 403 attendu`).toBe(403);
      const parsed = JSON.parse(body) as { code?: string; message?: string };
      expect(parsed.code, `${label} : code Postgres attendu 42501`).toBe("42501");
      expect(parsed.message, `${label} : permission denied`).toContain("permission denied");
      // Aucune valeur de réponse dans le corps d'erreur.
      expect(body.includes("q1_heart_condition")).toBe(false);
    }
  });

  it("TEST NOMMÉ (2) : les 3 colonnes non sensibles restent lisibles selon les politiques RLS existantes — admin (toutes lignes), client propriétaire (SA ligne, pas celles d'autrui)", async () => {
    // Admin aal1 et aal2 : la ligne A est lisible (politique is_admin).
    for (const [label, jwt] of [["admin aal1", jwtAal1], ["admin aal2", jwtAal2]] as [string, string][]) {
      const { status, body } = await restGet(NCOLS, orderA.id, jwt);
      expect(status, `${label} : 200 attendu sur les 3 colonnes`).toBe(200);
      const rows = JSON.parse(body) as Array<Record<string, unknown>>;
      expect(rows.length, `${label} : la ligne A est visible`).toBe(1);
      expect(rows[0]?.order_id).toBe(orderA.id);
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["created_at", "medical_advice_recommended", "order_id"]);
    }
    // Client propriétaire : SA ligne (owns_order).
    const own = await restGet(NCOLS, orderA.id, jwtClient);
    expect(own.status, "client : sa ligne est visible").toBe(200);
    expect((JSON.parse(own.body) as unknown[]).length).toBe(1);
    // Client propriétaire : PAS la ligne de l'autre client.
    const other = await restGet(NCOLS, orderB.id, jwtClient);
    expect(other.status, "client : requête valide").toBe(200);
    expect(JSON.parse(other.body) as unknown[]).toEqual([]);
  });

  it("TEST NOMMÉ (3) : POST /api/admin/par-q fonctionne toujours après la migration (service-role) et audite exactement 1 fois", async () => {
    guardCtx.auth = { userId: uidAdmin, isAdmin: true, hasMfa: true, aal2: true, sessionId: null };
    const auditsBefore = await auditsFor(orderA.id);

    const res = await post(
      new Request("http://localhost/api/admin/par-q", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderA.id }),
      }),
    );
    const raw = await res.text();
    expect(res.status, `200 attendu : ${raw}`).toBe(200);
    const body = JSON.parse(raw) as { orderId: string; answers: Record<string, boolean> };
    expect(body.orderId).toBe(orderA.id);
    expect(body.answers).toEqual({ q1: true, q2: true, q3: false, q4: false, q5: true, q6: false, q7: false });

    const auditsAfter = await auditsFor(orderA.id);
    expect(auditsAfter.length).toBe(auditsBefore.length + 1);
    expect((auditsAfter.at(-1) as Record<string, unknown>).actor_id).toBe(uidAdmin);
  });

  it("TEST NOMMÉ (4) : la requête EXACTE de la page clients (order_id, medical_advice_recommended, created_at) passe encore avec la session admin", async () => {
    // La page admin clients lit aptitude_questionnaires avec la session
    // (clients page l.104) : colonnes = "order_id, medical_advice_recommended,
    // created_at" — prouvé ici au niveau REST avec le JWT aal2 réel.
    const { status, body } = await restGet("order_id,medical_advice_recommended,created_at", orderA.id, jwtAal2);
    expect(status, `200 attendu : ${body}`).toBe(200);
    const rows = JSON.parse(body) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0]?.medical_advice_recommended).toBe(true);
  });
});
