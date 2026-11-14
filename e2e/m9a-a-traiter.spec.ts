import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "../tests/helpers/totp";

/**
 * M9a point (a) — E2E « À traiter » de bout en bout (dev UNIQUEMENT,
 * données FICTIVES, admin réel avec MFA TOTP réel — même chemin que
 * e2e/m9a-parq.spec.ts et m7a-payment.spec.ts) :
 *
 *   Test 1 — parcours complet :
 *     admin créé + rôle (service-role) → session (cookie @supabase/ssr)
 *     → enrôlement TOTP via les VRAIES routes /api/admin/mfa/* → aal2
 *     → /fr/admin/a-traiter : lead du jour, paiement verifying, e-mail
 *       en échec VISIBLES ;
 *     → traiter le lead (changement de statut, audité) ;
 *     → vérifier un paiement (liste admin : référence + montant attendu) ;
 *     → renvoyer l'e-mail en échec (bouton de la page) → file d'attente.
 *
 *   Test 2 — parcours d'un lead needs_review :
 *     identités côte à côte (nom enregistré / nom soumis) → décision
 *     « garder le nom actuel » avec motif → audité en base → le lead sort
 *     de la revue (compteur à 0), notes conservées.
 *
 * Base fraîche garantie par le global setup (`supabase db reset`) ;
 * AUCUN nettoyage d'`audit_logs` (append-only).
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
const AUTH_COOKIE = `sb-${new URL(env.apiUrl).hostname.split(".")[0]}-auth-token`;
const BASE = "http://localhost:3000";

async function restPost(
  request: APIRequestContext,
  table: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await request.post(`${env.apiUrl}/rest/v1/${table}`, {
    headers: serviceHeaders,
    data,
  });
  expect([200, 201]).toContain(res.status());
}

async function restGet(
  request: APIRequestContext,
  path: string,
): Promise<unknown[]> {
  const res = await request.get(`${env.apiUrl}/rest/v1/${path}`, { headers: serviceHeaders });
  expect(res.status()).toBe(200);
  return (await res.json()) as unknown[];
}

/** Admin réel + rôle + session (cookie @supabase/ssr) + défi TOTP réel. */
async function adminAal2(page: import("@playwright/test").Page, request: APIRequestContext) {
  const stamp = Date.now();
  const adminEmail = `e2e-admin-atr-${stamp}@test.tkf`;
  const adminPassword = `Str0ng-${stamp}-aal2`;

  const createUserRes = await request.post(`${env.apiUrl}/auth/v1/admin/users`, {
    headers: serviceHeaders,
    data: { email: adminEmail, password: adminPassword, email_confirm: true },
  });
  expect([200, 201]).toContain(createUserRes.status());
  const adminUser = (await createUserRes.json()) as { id: string };
  await restPost(request, "user_roles", { user_id: adminUser.id, role: "admin" });

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
      name: AUTH_COOKIE,
      value: `base64-${Buffer.from(sessionJson).toString("base64url")}`,
      url: BASE,
    },
  ]);

  const enrollRes = await page.request.post("/api/admin/mfa/enroll");
  expect(enrollRes.status()).toBe(200);
  const enroll = (await enrollRes.json()) as { factorId: string; secret: string };
  expect(enroll.factorId).toBeTruthy();
  const verifyRes = await page.request.post("/api/admin/mfa/verify", {
    data: { factorId: enroll.factorId, code: totp(enroll.secret) },
  });
  expect(verifyRes.status(), "défi TOTP accepté → aal2").toBe(200);

  return { adminUserId: adminUser.id };
}

test("M9a (a) E2E : connexion admin (TOTP réel) → « À traiter » → lead traité → paiement vérifié → e-mail en échec renvoyé", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now();

  const { adminUserId } = await adminAal2(page, request);

  // ── Données fictives (service-role) ─────────────────────────────────────
  // Lead du jour.
  const leadId = crypto.randomUUID();
  await restPost(request, "leads", {
    id: leadId,
    name: "E2E Lead À traiter",
    phone: "+213 7 11 22 33 44",
    phone_norm: `+213711${String(stamp).slice(-8)}`,
    email: `e2e-atr-${stamp}@test.tkf`,
    offer_slug: "starter",
    source: "site",
    status: "new",
    consent: true,
  });

  // Commande + paiement en attente de vérification.
  const customerId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  await restPost(request, "customers", {
    id: customerId,
    name: "E2E Client À traiter",
    phone: "+213 7 55 66 77 88",
    phone_norm: `+213755${String(stamp).slice(-8)}`,
    email: `e2e-atr-cust-${stamp}@test.tkf`,
  });
  await restPost(request, "orders", {
    id: orderId,
    reference: `TKF-E2EATR-${stamp}`,
    customer_id: customerId,
    status: "pending_payment",
    offer_slug: "starter",
    offer_name: "Starter",
    unit_price_da: 6000,
    discount_da: 0,
    total_da: 6000,
  });
  const paymentId = crypto.randomUUID();
  await restPost(request, "payments", {
    id: paymentId,
    order_id: orderId,
    provider: "fake",
    amount_da: 6000,
    status: "verifying",
  });

  // E-mail en échec lié à ce paiement.
  const outboxId = crypto.randomUUID();
  await restPost(request, "email_outbox", {
    id: outboxId,
    payment_id: paymentId,
    event_type: "payment_confirmed",
    recipient: `e2e-atr-cust-${stamp}@test.tkf`,
    status: "failed",
    attempts: 2,
    last_error: "smtp timeout (E2E)",
  });

  // ── Écran « À traiter » : les trois éléments sont VISIBLES ──────────────
  await page.goto("/fr/admin/a-traiter");
  await expect(page.getByRole("heading", { name: "À traiter", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  // Lead du jour.
  await expect(page.getByText("E2E Lead À traiter")).toBeVisible();
  // Paiement en vérification : montant affiché (l'uuid de commande sert de clé).
  await expect(page.getByText("6000 DA")).toBeVisible();
  // E-mail en échec : destinataire + tentatives + bouton de renvoi.
  await expect(page.getByText(`e2e-atr-cust-${stamp}@test.tkf`)).toBeVisible();
  await expect(page.getByText("Tentatives: 2")).toBeVisible();

  // ── 1) Traiter le lead : changement de statut (route auditée) ───────────
  const statusRes = await page.request.post(`/api/admin/leads/${leadId}/status`, {
    data: { status: "contacted" },
  });
  expect(statusRes.status()).toBe(200);
  const leads = await restGet(request, `leads?id=eq.${leadId}&select=status`);
  expect((leads[0] as { status: string }).status).toBe("contacted");
  const leadAudits = await restGet(
    request,
    `audit_logs?entity_id=eq.${leadId}&action=eq.lead_status_changed&select=metadata`,
  );
  expect(leadAudits).toHaveLength(1);
  expect(leadAudits[0]).toMatchObject({
    metadata: { from: "new", to: "contacted" },
  });

  // ── 2) Vérifier un paiement : liste admin, référence + montant attendu ──
  const listRes = await page.request.get("/api/admin/payments");
  expect(listRes.status()).toBe(200);
  const list = (await listRes.json()) as {
    payments: Array<{ reference: string; expectedAmountDa: number; status: string }>;
  };
  const entry = list.payments.find((p) => p.reference === `TKF-E2EATR-${stamp}`);
  expect(entry, "le paiement en vérification apparaît dans la liste admin").toBeTruthy();
  expect(entry?.expectedAmountDa).toBe(6000);

  // ── 3) Renvoyer l'e-mail en échec (bouton de la page) ───────────────────
  await page.getByRole("button", { name: "Renvoyer" }).click();
  await expect(page.getByText("Renvoyé (repris en file d'attente)")).toBeVisible({
    timeout: 30_000,
  });
  const outbox = await restGet(
    request,
    `email_outbox?id=eq.${outboxId}&select=status`,
  );
  expect((outbox[0] as { status: string }).status).toBe("queued");
  const resendAudits = await restGet(
    request,
    `audit_logs?entity_id=eq.${outboxId}&action=eq.email_resend&select=actor_id`,
  );
  expect(resendAudits).toHaveLength(1);
  expect(resendAudits[0]).toMatchObject({ actor_id: adminUserId });
});

test("M9a (a) E2E : parcours d'un lead needs_review — identités côte à côte, décision audité avec motif, sortie du compteur", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now();

  await adminAal2(page, request);

  // Lead fictif en attente de revue d'identité (m5 : submitted_name conservé,
  // nom du lead inchangé, notes du coach préservées).
  const leadId = crypto.randomUUID();
  await restPost(request, "leads", {
    id: leadId,
    name: "Famille Amrani",
    submitted_name: "Yacine Amrani",
    needs_review: true,
    phone: "+213 7 99 88 77 66",
    phone_norm: `+213799${String(stamp).slice(-8)}`,
    email: `e2e-rev-${stamp}@test.tkf`,
    offer_slug: "pack_3m",
    source: "quiz",
    status: "new",
    notes: "Note du coach (E2E).",
    consent: true,
  });

  await page.goto("/fr/admin/a-traiter");
  await expect(page.getByRole("heading", { name: "À traiter", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Identités côte à côte (libellés + les deux noms).
  await expect(page.getByText("Nom enregistré: Famille Amrani")).toBeVisible();
  await expect(page.getByText("Nom soumis: Yacine Amrani")).toBeVisible();
  await expect(page.getByText("Offre: pack_3m")).toBeVisible();
  await expect(page.getByText("Source: quiz")).toBeVisible();

  // Décision « garder le nom actuel » avec motif obligatoire.
  await page.getByPlaceholder("Motif de la décision (obligatoire)").fill("même famille, numéro partagé");
  await page.getByRole("button", { name: "Garder le nom actuel" }).click();

  // Confirmation déterministe : la ligne quitte la revue (router.refresh) →
  // compteur à 0, plus aucune identité côte à côte.
  await expect(page.getByText("Revue d'identité (doublons de nom) (0)")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Nom soumis: Yacine Amrani")).toHaveCount(0);

  // Base : décision appliquée + audité avec motif ; notes du coach intactes.
  const leads = await restGet(
    request,
    `leads?id=eq.${leadId}&select=name,submitted_name,needs_review,notes`,
  );
  expect(leads[0]).toMatchObject({
    name: "Famille Amrani",
    needs_review: false,
    notes: "Note du coach (E2E).",
  });
  const audits = await restGet(
    request,
    `audit_logs?entity_id=eq.${leadId}&action=eq.lead_identity_reviewed&select=actor_role,metadata`,
  );
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actor_role: "admin",
    metadata: {
      decision: "keep_existing",
      reason: "même famille, numéro partagé",
      submitted_name: "Yacine Amrani",
    },
  });
});
