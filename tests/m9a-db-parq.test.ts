import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";
import { totp } from "./helpers/totp";
import { userRateLimitKey } from "@/lib/security/rate-limit";

/**
 * M9a point (f) — INTÉGRATION base réelle de la route /api/admin/par-q :
 *
 *  - un admin RÉEL (compte créé + rôle admin + TOTP enrôlé et challengeé
 *    par le test — la session aal2 est réelle, le garde est alimenté avec
 *    CETTE identité) consulte la commande A ;
 *  - il reçoit UNIQUEMENT les réponses de A (jamais celles de B) ;
 *  - exactement UNE entrée d'audit `parq_answers_read` est écrite pour A,
 *    sans aucune réponse (metadata = order_id seul).
 *
 * Tout le reste est RÉEL : client service-role, RPC check_rate_limit,
 * tables `orders` / `aptitude_questionnaires` / `audit_logs` / 
 * `rate_limit_counters` (colonnes : bucket_key, window_start, hit_count —
 * phase1_schema.sql l.474-478). Les entrées `audit_logs` sont en ajout
 * seul (trigger audit_logs_append_only, phase1_schema.sql l.410-412) :
 * aucun nettoyage n'est possible ni tenté (reliquats acceptés, cf.
 * tests/rate-limit-nat.test.ts).
 */

const env = getLocalEnv();
const runId = `${Date.now()}`;
const uidAdmin = crypto.randomUUID();
const PASSWORD = `Str0ng-${runId}-pass`;

const customerA = {
  id: crypto.randomUUID(),
  name: "Client A (test PAR-Q)",
  phone: "+213555000111",
  phone_norm: "+213555000111",
  email: `m9a-parq-a-${runId}@test.local`,
};
const customerB = {
  id: crypto.randomUUID(),
  name: "Client B (test PAR-Q)",
  phone: "+213555000222",
  phone_norm: "+213555000222",
  email: `m9a-parq-b-${runId}@test.local`,
};
const orderA = {
  id: crypto.randomUUID(),
  reference: `TKF-DBPARQ-${runId}-A`,
  customer_id: customerA.id,
  status: "paid" as const,
  offer_slug: "starter",
  offer_name: "Starter",
  unit_price_da: 6000,
  discount_da: 0,
  total_da: 6000,
};
const orderB = { ...orderA, id: crypto.randomUUID(), reference: `TKF-DBPARQ-${runId}-B`, customer_id: customerB.id };

/** Réponses DISTINCTES : A ≠ B — la route ne doit renvoyer que celles de A. */
const answersA = {
  q1_heart_condition: true,
  q2_exertion_chest_pain: true,
  q3_rest_chest_pain: false,
  q4_syncope: false,
  q5_joint_bone_problem: true,
  q6_heart_medication: false,
  q7_other_restriction: false,
};
const answersB = {
  q1_heart_condition: false,
  q2_exertion_chest_pain: false,
  q3_rest_chest_pain: false,
  q4_syncope: false,
  q5_joint_bone_problem: false,
  q6_heart_medication: false,
  q7_other_restriction: true,
};

const guardCtx = vi.hoisted(() => ({ auth: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/session", () => ({
  requireAdminAal2: async () =>
    guardCtx.auth
      ? { ok: true, auth: guardCtx.auth }
      : { ok: false, status: 401, error: "unauthenticated" },
}));

let service: SupabaseClient;
let post: typeof import("@/app/api/admin/par-q/route").POST;
let parqBucket: string;

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/par-q", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function auditsFor(orderId: string) {
  const { data, error } = await service
    .from("audit_logs")
    .select("id, actor_id, actor_role, action, entity_type, entity_id, metadata")
    .eq("action", "parq_answers_read")
    .eq("entity_id", orderId);
  if (error) throw new Error(`lecture audit_logs : ${error.message}`);
  return data ?? [];
}

beforeAll(async () => {
  // Clés service-role rendues visibles au module `@/lib/supabase/admin`
  // (lu au moment de l'appel — avant le premier createSupabaseAdminClient).
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;

  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const mod = await import("@/app/api/admin/par-q/route");
  post = mod.POST;

  // Admin RÉEL : compte + rôle + TOTP enrôlé et vérifié (aal2 atteint).
  const created = await service.auth.admin.createUser({
    id: uidAdmin,
    email: `m9a-admin-${runId}@test.local`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser : ${created.error.message}`);
  const grant = await service.rpc("admin_grant_role", { p_user_id: uidAdmin, p_role: "admin" });
  if (grant.error) throw new Error(`admin_grant_role : ${grant.error.message}`);

  const admin = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await admin.auth.signInWithPassword({
    email: `m9a-admin-${runId}@test.local`,
    password: PASSWORD,
  });
  if (signed.error) throw new Error(`signIn : ${signed.error.message}`);
  const enroll = await admin.auth.mfa.enroll({ factorType: "totp", friendlyName: "test-m9a-parq" });
  if (enroll.error || !enroll.data) throw new Error(`enroll : ${enroll.error?.message}`);
  const secret =
    enroll.data.totp?.secret ?? (enroll.data as unknown as { totp: { secret: string } }).totp.secret;
  const challenge = await admin.auth.mfa.challenge({ factorId: enroll.data.id });
  if (challenge.error || !challenge.data) throw new Error(`challenge : ${challenge.error?.message}`);
  const verify = await admin.auth.mfa.verify({
    factorId: enroll.data.id,
    challengeId: challenge.data.id,
    code: totp(secret),
  });
  if (verify.error) throw new Error(`verify : ${verify.error.message}`);

  // Le garde est alimenté avec l'identité RÉELLE de cet admin aal2.
  guardCtx.auth = {
    userId: uidAdmin,
    isAdmin: true,
    hasMfa: true,
    aal2: true,
    sessionId: null,
  };

  // Données fictives : deux clients, deux commandes, deux questionnaires.
  const insCustomers = await service.from("customers").insert([customerA, customerB]);
  if (insCustomers.error) throw new Error(`customers : ${insCustomers.error.message}`);
  const insOrders = await service.from("orders").insert([orderA, orderB]);
  if (insOrders.error) throw new Error(`orders : ${insOrders.error.message}`);
  const waiver = { waiver_accepted: true, waiver_accepted_at: new Date().toISOString(), waiver_version: "test-v1" };
  const insApt = await service.from("aptitude_questionnaires").insert([
    { order_id: orderA.id, customer_id: customerA.id, ...answersA, medical_advice_recommended: true, objective: "strength", experience_level: "beginner", ...waiver },
    { order_id: orderB.id, customer_id: customerB.id, ...answersB, medical_advice_recommended: false, objective: "endurance", experience_level: "beginner", ...waiver },
  ]);
  if (insApt.error) throw new Error(`aptitude_questionnaires : ${insApt.error.message}`);

  // La clé de rate limit est calculée dans le MÊME processus que la route
  // (sel local identique) — sert au nettoyage du compteur.
  parqBucket = userRateLimitKey(uidAdmin, "parq_read_user");
}, 120_000);

afterAll(async () => {
  // Nettoyage : aptitude (cascade via orders), orders, customers, compteur.
  // audit_logs : append-only — AUCUNE suppression tentée (reliquats acceptés).
  await service.from("orders").delete().in("id", [orderA.id, orderB.id]);
  await service.from("customers").delete().in("id", [customerA.id, customerB.id]);
  await service.from("rate_limit_counters").delete().eq("bucket_key", parqBucket);
  await service.auth.admin.deleteUser(uidAdmin).catch(() => undefined);
});

describe("M9a (f) — intégration DB : consultation audité d'une seule commande", () => {
  it("TEST NOMMÉ : l'admin aal2 consulte A ⇒ reçoit UNIQUEMENT les réponses de A, et EXACTEMENT 1 entrée d'audit pour A (sans aucune réponse)", async () => {
    const auditsBefore = await auditsFor(orderA.id);

    const res = await post(jsonRequest({ orderId: orderA.id }));
    const raw = await res.text();
    expect(res.status, `200 attendu : ${raw}`).toBe(200);
    const body = JSON.parse(raw) as { orderId: string; answers: Record<string, boolean> };

    // Uniquement A : les 7 booléens de A, jamais ceux de B.
    expect(body.orderId).toBe(orderA.id);
    expect(body.answers).toEqual({ q1: true, q2: true, q3: false, q4: false, q5: true, q6: false, q7: false });
    expect(body.answers).not.toEqual({ q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: true });

    // Exactement 1 audit pour A (delta), avec l'acteur réel et metadata minimale.
    const auditsAfter = await auditsFor(orderA.id);
    expect(auditsAfter.length).toBe(auditsBefore.length + 1);
    const row = auditsAfter.at(-1) as Record<string, unknown>;
    expect(row.actor_id).toBe(uidAdmin);
    expect(row.actor_role).toBe("admin");
    expect(row.entity_type).toBe("order");
    expect(row.metadata).toEqual({ order_id: orderA.id });
    const serialized = JSON.stringify(row);
    for (const col of Object.keys(answersA)) expect(serialized.includes(col)).toBe(false);

    // La consultation de A n'écrit AUCUN audit pour B.
    const auditsB = await auditsFor(orderB.id);
    expect(auditsB.length).toBe(0);
  });
});
