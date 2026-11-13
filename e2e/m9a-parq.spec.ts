import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "../tests/helpers/totp";

/**
 * M9a point (f) — E2E « consultation EXPLICITE des réponses PAR-Q »
 * (dev UNIQUEMENT, serveur fourni par playwright.config, données fictives) :
 *
 *   admin créé + rôle (service-role) → session (cookie @supabase/ssr)
 *   → enrôlement TOTP via les VRAIES routes /api/admin/mfa/* + défi vérifié
 *   → fiche client /fr/admin/clients?customer=… :
 *       · AUCUNE réponse visible au chargement (seulement le drapeau
 *         « avis médical » et le bouton « Voir les réponses ») ;
 *   → clic « Voir les réponses » → les 7 réponses s'affichent ;
 *   → clic « Masquer les réponses » → elles disparaissent ;
 *   → base : EXACTEMENT 1 entrée d'audit `parq_answers_read` pour la
 *     commande consultée, sans aucune réponse (metadata = order_id seul).
 *
 * Données insérées en service-role (clients / orders / aptitude_questionnaires
 * — colonnes confirmées dans 20261029100000_phase1_schema.sql l.169-178,
 * l.191-211 et l.420-441). Base fraîche garantie par le global setup
 * (`supabase db reset`) ; AUCUN nettoyage d'`audit_logs` (append-only).
 */

function localSupabaseEnv(): { apiUrl: string; anonKey: string; serviceRoleKey: string } {
  const raw = readFileSync(".env.local", "utf8");
  const read = (key: string): string => {
    const m = raw.match(new RegExp(`^${key}="?([^"\\r\\n]+)"?`, "m"));
    if (!m?.[1]) throw new Error(`clé absente de .env.local : ${key}`);
    return m[1];
  };
  return {
    apiUrl: read("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

const env = localSupabaseEnv();
const serviceHeaders = {
  apikey: env.serviceRoleKey,
  Authorization: `Bearer ${env.serviceRoleKey}`,
  "Content-Type": "application/json",
};

test("M9a (f) E2E : fiche client → aucune réponse visible → consultation explicite → réponses visibles → audit unique", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const adminEmail = `e2e-admin-parq-${stamp}@test.tkf`;
  const adminPassword = `Str0ng-${stamp}-aal2`;

  // ── 1) Admin réel + données fictives (service-role) ─────────────────────
  const createUserRes = await request.post(`${env.apiUrl}/auth/v1/admin/users`, {
    headers: serviceHeaders,
    data: { email: adminEmail, password: adminPassword, email_confirm: true },
  });
  expect([200, 201]).toContain(createUserRes.status());
  const adminUser = (await createUserRes.json()) as { id: string };
  const roleRes = await request.post(`${env.apiUrl}/rest/v1/user_roles`, {
    headers: serviceHeaders,
    data: { user_id: adminUser.id, role: "admin" },
  });
  expect([200, 201]).toContain(roleRes.status());

  const customerId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const custRes = await request.post(`${env.apiUrl}/rest/v1/customers`, {
    headers: serviceHeaders,
    data: {
      id: customerId,
      name: "E2E PAR-Q Client",
      phone: "+213555000999",
      phone_norm: "+213555000999",
      email: `e2e-parq-${stamp}@test.tkf`,
    },
  });
  expect([200, 201]).toContain(custRes.status());
  const orderRes = await request.post(`${env.apiUrl}/rest/v1/orders`, {
    headers: serviceHeaders,
    data: {
      id: orderId,
      reference: `TKF-E2EPARQ-${stamp}`,
      customer_id: customerId,
      status: "paid",
      offer_slug: "starter",
      offer_name: "Starter",
      unit_price_da: 6000,
      discount_da: 0,
      total_da: 6000,
    },
  });
  expect([200, 201]).toContain(orderRes.status());
  // Réponses fictives : q1..q3 vraies, q4..q7 fausses (vérifiables à l'écran).
  const aptRes = await request.post(`${env.apiUrl}/rest/v1/aptitude_questionnaires`, {
    headers: serviceHeaders,
    data: {
      order_id: orderId,
      customer_id: customerId,
      q1_heart_condition: true,
      q2_exertion_chest_pain: true,
      q3_rest_chest_pain: true,
      q4_syncope: false,
      q5_joint_bone_problem: false,
      q6_heart_medication: false,
      q7_other_restriction: false,
      medical_advice_recommended: true,
      objective: "strength",
      experience_level: "beginner",
      waiver_accepted: true,
      waiver_accepted_at: new Date().toISOString(),
      waiver_version: "e2e-v1",
    },
  });
  expect([200, 201]).toContain(aptRes.status());

  // ── 2) Session admin (cookie @supabase/ssr) ─────────────────────────────
  const grantRes = await request.post(`${env.apiUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.anonKey, "Content-Type": "application/json" },
    data: { email: adminEmail, password: adminPassword },
  });
  expect(grantRes.status()).toBe(200);
  const grant = (await grantRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const sessionJson = JSON.stringify({
    access_token: grant.access_token,
    refresh_token: grant.refresh_token,
    token_type: "bearer",
    expires_in: grant.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + grant.expires_in,
    user: { id: adminUser.id },
  });
  await page.context().addCookies([
    {
      name: `sb-${new URL(env.apiUrl).hostname.split(".")[0]}-auth-token`,
      value: `base64-${Buffer.from(sessionJson).toString("base64url")}`,
      url: "http://localhost:3000",
    },
  ]);

  // ── 3) Défi TOTP réel via les VRAIES routes → session aal2 ──────────────
  const enrollRes = await page.request.post("/api/admin/mfa/enroll");
  expect(enrollRes.status()).toBe(200);
  const enroll = (await enrollRes.json()) as { factorId: string; secret: string };
  expect(enroll.factorId).toBeTruthy();
  const verifyRes = await page.request.post("/api/admin/mfa/verify", {
    data: { factorId: enroll.factorId, code: totp(enroll.secret) },
  });
  expect(verifyRes.status(), "défi TOTP accepté → aal2").toBe(200);

  // ── 4) Fiche client : AUCUNE réponse visible au chargement ──────────────
  await page.goto(`/fr/admin/clients?customer=${customerId}`);
  await expect(page.getByText("E2E PAR-Q Client").first()).toBeVisible();
  await expect(page.getByText("TKF-E2EPARQ-" + stamp).first()).toBeVisible();
  // Drapeau non sensible visible ; panneau de réponses absent.
  await expect(page.getByText("Rempli")).toBeVisible();
  await expect(page.getByText("Recommandé")).toBeVisible();
  await expect(page.getByText("Réponses du questionnaire d'aptitude")).toHaveCount(0);
  await expect(page.getByText("Affection cardiaque", { exact: true })).toHaveCount(0);

  // ── 5) Consultation EXPLICITE : clic → les 7 réponses s'affichent ───────
  await page.getByRole("button", { name: "Voir les réponses" }).click();
  // Première consultation en dev : compilation de la route API au premier
  // appel — délai élargi (le bouton reste « Consultation en cours… »).
  await expect(page.getByText("Réponses du questionnaire d'aptitude")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Affection cardiaque", { exact: true })).toBeVisible();
  for (const question of [
    "Douleur thoracique à l'effort",
    "Douleur thoracique au repos",
    "Perte de connaissance (syncope)",
    "Problème osseux ou articulaire",
    "Traitement pour une affection cardiaque",
    "Autre restriction",
  ]) {
    await expect(page.getByText(question, { exact: true })).toBeVisible();
  }
  // q1..q3 = Oui, q4..q7 = Non (données fictives vérifiées à l'écran).
  await expect(page.getByText("Oui", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Non", { exact: true })).toHaveCount(4);

  // ── 6) Masquer : les réponses disparaissent (état client uniquement) ────
  await page.getByRole("button", { name: "Masquer les réponses" }).click();
  await expect(page.getByText("Réponses du questionnaire d'aptitude")).toHaveCount(0);
  await expect(page.getByText("Affection cardiaque", { exact: true })).toHaveCount(0);

  // ── 7) Base : EXACTEMENT 1 audit pour la commande, sans aucune réponse ──
  const auditRes = await request.get(
    `${env.apiUrl}/rest/v1/audit_logs?action=eq.parq_answers_read&entity_id=eq.${orderId}`,
    { headers: serviceHeaders },
  );
  expect(auditRes.status()).toBe(200);
  const audits = (await auditRes.json()) as Array<{
    actor_id: string;
    actor_role: string;
    action: string;
    entity_type: string;
    entity_id: string;
    metadata: Record<string, unknown>;
  }>;
  expect(audits.length, "exactement 1 consultation → 1 audit").toBe(1);
  expect(audits[0]?.actor_id).toBe(adminUser.id);
  expect(audits[0]?.actor_role).toBe("admin");
  expect(audits[0]?.entity_type).toBe("order");
  expect(audits[0]?.metadata).toEqual({ order_id: orderId });
  const serialized = JSON.stringify(audits[0]);
  for (const col of [
    "q1_heart_condition",
    "q2_exertion_chest_pain",
    "q3_rest_chest_pain",
    "q4_syncope",
    "q5_joint_bone_problem",
    "q6_heart_medication",
    "q7_other_restriction",
  ]) {
    expect(serialized.includes(col), `l'audit ne contient jamais ${col}`).toBe(false);
  }
});
