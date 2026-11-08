import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "../tests/helpers/totp";
import { createStatusToken, hashStatusToken } from "../src/lib/payments/status-token";

/**
 * M7a — E2E parcours complet « paiement manuel BaridiMob » (dev UNIQUEMENT,
 * fournisseur fake imposé par la config Playwright) :
 *
 *   commande (jeton de statut) → soumission de preuve (référence txn)
 *   → SANS aal2 : liste et confirmation REFUSÉES (403, garde réelle)
 *   → enrôlement TOTP admin via les VRAIES routes /api/admin/mfa/*
 *   → défi vérifié (code TOTP généré dans le test — MFA « simulé »)
 *   → liste admin (montant attendu, preuve) → confirmation montant exact
 *   → rejeu « unchanged » (droit ouvert UNE FOIS, e-mail UNE FOIS)
 *   → statut « confirmé » côté client + reçu PDF téléchargeable.
 *
 * Session admin : cookie @supabase/ssr injecté (password grant GoTrue
 * local) — le même chemin que le défi TOTP de l'application.
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

/** Nom du cookie de session @supabase/ssr (storageKey dérivé du host). */
const AUTH_COOKIE = `sb-${new URL(env.apiUrl).hostname.split(".")[0]}-auth-token`;

async function restGet(request: APIRequestContext, path: string): Promise<unknown[]> {
  const res = await request.get(`${env.apiUrl}/rest/v1/${path}`, { headers: serviceHeaders });
  expect(res.status()).toBe(200);
  return (await res.json()) as unknown[];
}

test("commande → preuve → confirmation admin (MFA TOTP) → statut confirmé + reçu", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const freshToken = createStatusToken().token; // lien « e-mail » simulé (étape 8)
  const adminEmail = `e2e-admin-${stamp}@test.tkf`;
  const adminPassword = `Str0ng-${stamp}-aal2`;
  const email = `e2e-m7a-${stamp}@test.tkf`;
  const idempotencyKey = `e2e-m7a-${stamp}-${Math.random().toString(36).slice(2, 8)}`;

  // ── Mise en place : admin réel (compte + rôle) ──────────────────────────
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

  // ── Session admin (aal1) : password grant + cookie @supabase/ssr ────────
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
      // Encodage serveur par défaut d'@supabase/ssr : base64url + préfixe.
      value: `base64-${Buffer.from(sessionJson).toString("base64url")}`,
      url: "http://localhost:3000",
    },
  ]);

  // ── 1) Commande réelle (fournisseur fake, même contrat HTTP qu'en prod) ─
  const createRes = await request.post("/api/orders", {
    data: {
      offerSlug: "starter",
      name: "E2E M7a",
      email,
      consentTerms: true,
      consentPrivacy: true,
      consentRefunds: true,
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    },
    headers: { "Idempotency-Key": idempotencyKey },
  });
  expect(createRes.status()).toBe(200);
  const created = (await createRes.json()) as {
    reference: string;
    total_da: number;
    statusToken: string;
  };
  expect(created.statusToken).toBeTruthy();

  // ── 2) Soumission de la preuve (référence de transaction) ───────────────
  const txn = `E2E${String(stamp).slice(-8)}TX`;
  const proofRes = await request.post(`/api/orders/${created.reference}/proof`, {
    multipart: { statusToken: created.statusToken, txn },
  });
  expect(proofRes.status()).toBe(200);
  expect(((await proofRes.json()) as { status: string }).status).toBe("verifying");

  // ── 3) SANS aal2 : liste ET confirmation refusées (garde réelle) ────────
  const listBefore = await page.request.get("/api/admin/payments");
  expect(listBefore.status()).toBe(403);
  expect(((await listBefore.json()) as { error: string }).error).toBe("mfa_required");

  const orderRows = await restGet(
    request,
    `orders?reference=eq.${created.reference}&select=id,total_da`,
  );
  const order = orderRows[0] as { id: string; total_da: number };
  expect(order).toBeTruthy();
  const payments = await restGet(
    request,
    `payments?order_id=eq.${order.id}&select=id,order_id,amount_da,status`,
  );
  const payment = payments[0] as { id: string; order_id: string; amount_da: number };
  expect(payment).toBeTruthy();

  const confirmBefore = await page.request.post(
    `/api/admin/payments/${payment.id}/confirm`,
    { data: { amountDa: created.total_da } },
  );
  expect(confirmBefore.status()).toBe(403);

  // ── 4) Enrôlement TOTP via les vraies routes + défi vérifié ─────────────
  const enrollRes = await page.request.post("/api/admin/mfa/enroll");
  expect(enrollRes.status()).toBe(200);
  const enroll = (await enrollRes.json()) as {
    factorId: string;
    secret: string;
    recoveryCodes: string[];
  };
  expect(enroll.factorId).toBeTruthy();
  expect(enroll.secret).toBeTruthy();
  expect(enroll.recoveryCodes.length).toBeGreaterThanOrEqual(8);

  const verifyRes = await page.request.post("/api/admin/mfa/verify", {
    data: { factorId: enroll.factorId, code: totp(enroll.secret) },
  });
  expect(verifyRes.status()).toBe(200);

  // ── 5) Liste admin (aal2) : montant attendu + preuve visibles ───────────
  const listRes = await page.request.get("/api/admin/payments");
  expect(listRes.status()).toBe(200);
  const list = (await listRes.json()) as {
    payments: Array<{
      paymentId: string;
      reference: string;
      expectedAmountDa: number;
      proofs: Array<{ txnReference: string; duplicate: boolean }>;
    }>;
  };
  const entry = list.payments.find((p) => p.reference === created.reference);
  expect(entry).toBeTruthy();
  expect(entry?.expectedAmountDa).toBe(created.total_da); // copie figée
  expect(entry?.proofs[0]?.txnReference).toBe(txn);
  expect(entry?.proofs[0]?.duplicate).toBe(false);

  // ── 6) Confirmation montant EXACT + rejeu « unchanged » ─────────────────
  const confirmRes = await page.request.post(`/api/admin/payments/${payment.id}/confirm`, {
    data: { amountDa: created.total_da },
  });
  expect(confirmRes.status()).toBe(200);
  expect(((await confirmRes.json()) as { unchanged: boolean }).unchanged).toBe(false);

  const replayRes = await page.request.post(`/api/admin/payments/${payment.id}/confirm`, {
    data: { amountDa: created.total_da },
  });
  expect(replayRes.status()).toBe(200);
  expect(((await replayRes.json()) as { unchanged: boolean }).unchanged).toBe(true);

  // ── 7) Effets en base : statut paid, e-mail UNE fois, audit UNE fois ────
  const orders = await restGet(request, `orders?id=eq.${payment.order_id}&select=status`);
  expect((orders[0] as { status: string }).status).toBe("paid");

  const outbox = await restGet(
    request,
    `email_outbox?payment_id=eq.${payment.id}&select=event_type,status`,
  );
  // M8 : la confirmation envoie DEUX e-mails distincts (confirmation +
  // accès PDF) — le rejeu n'en ajoute AUCUN : 1 de chaque, jamais 2.
  expect(outbox).toHaveLength(2);
  expect(outbox).toContainEqual({ event_type: "payment_confirmed", status: "sent" });
  expect(outbox).toContainEqual({ event_type: "pdf_access", status: "sent" });

  const audits = await restGet(
    request,
    `audit_logs?entity_id=eq.${payment.id}&action=eq.payment_confirm_admin&select=id`,
  );
  expect(audits).toHaveLength(1); // rejeu : AUCUN second audit

  // ── 8) Côté client : ANCIEN lien caduc (jeton renouvelé à la confirmation),
  //      nouveau lien (celui de l'e-mail) → statut confirmé + reçu PDF ────
  await page.goto(`/fr/orders/status?token=${created.statusToken}`);
  await expect(page.getByText("Commande non disponible")).toBeVisible();

  // L'e-mail de confirmation porte un NOUVEAU jeton (renew_order_status_token,
  // même RPC que notify). Le test simule le clic sur le lien de l'e-mail :
  // régénération + changement du hash, puis navigation avec le jeton frais.
  const freshRes = await request.post(`${env.apiUrl}/rest/v1/rpc/renew_order_status_token`, {
    headers: serviceHeaders,
    data: {
      p_order_id: payment.order_id,
      p_new_status_token_hash: hashStatusToken(freshToken),
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  expect(freshRes.status()).toBe(204);
  await page.goto(`/fr/orders/status?token=${freshToken}`);
  await expect(page.getByText("Paiement confirmé")).toBeVisible();
  const receiptLink = page.getByRole("link", { name: /reçu/i });
  await expect(receiptLink).toBeVisible();

  const receiptRes = await page.request.get(
    `/api/orders/${created.reference}/receipt?statusToken=${freshToken}`,
  );
  expect(receiptRes.status()).toBe(200);
  expect(receiptRes.headers()["content-type"]).toBe("application/pdf");
  const pdf = await receiptRes.body();
  expect(pdf.slice(0, 5).toString("ascii")).toBe("%PDF-");

  // ── Nettoyage (audit_logs : append-only, non supprimé) ──────────────────
  await request.delete(`${env.apiUrl}/rest/v1/orders?id=eq.${payment.order_id}`, {
    headers: serviceHeaders,
  });
  await request.delete(`${env.apiUrl}/rest/v1/customers?email=eq.${email}`, {
    headers: serviceHeaders,
  });
  await request.delete(`${env.apiUrl}/auth/v1/admin/users/${adminUser.id}`, {
    headers: serviceHeaders,
  });
});
