import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fakeWebhookSignature } from "../src/lib/payments/fake";

/** Clés du Supabase local (.env.static service role — serveur dev uniquement). */
function localSupabaseEnv(): { apiUrl: string; serviceRoleKey: string } {
  const raw = readFileSync(".env.local", "utf8");
  const read = (key: string): string => {
    const m = raw.match(new RegExp(`^${key}="?([^"\\r\\n]+)"?`, "m"));
    if (!m?.[1]) throw new Error(`clé absente de .env.local : ${key}`);
    return m[1];
  };
  return { apiUrl: read("NEXT_PUBLIC_SUPABASE_URL"), serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY") };
}

/**
 * M6 — E2E parcours de commande avec le fournisseur fictif « fake »
 * (dev UNIQUEMENT — la config Playwright impose APP_ENV=development) :
 *   page offre → POST /api/orders (jeton de statut) → notification webhook
 *   SIGNÉE (HMAC, tolérance d'horloge) → page de statut neutre → « paid ».
 *
 * C'est le même chemin qu'empruntera SlickPay/Chargily au M7 : signature
 * HMAC, requête webhook brutale, notification → transition_payment.
 */

const env = localSupabaseEnv();
const serviceHeaders = {
  apikey: env.serviceRoleKey,
  Authorization: `Bearer ${env.serviceRoleKey}`,
};

test("commande fake → webhook signé → page de statut « Paiement confirmé »", async ({
  page,
  request,
}) => {
  // 1) L'offre est réellement consultable (étape UI du parcours réel).
  await page.goto("/fr/coaching/starter");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const email = `e2e-order-${Date.now()}@test.tkf`;
  const idempotencyKey = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 2) Création de commande (futur formulaire de caisse, même contrat HTTP).
  const createRes = await request.post("/api/orders", {
    data: {
      offerSlug: "starter",
      name: "E2E Playwright",
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
    statusToken?: string;
    duplicated: boolean;
    paymentRedirectUrl: string | null;
  };
  expect(created.reference).toMatch(/^TKF-\d{4}-[2-9A-HJKMNP-Z]{4}$/);
  expect(created.total_da).toBe(2000); // Starter en base, jamais du navigateur.
  expect(created.statusToken).toBeTruthy();
  expect(created.paymentRedirectUrl).toBe(`/fr/payment/simulate/${created.reference}`);

  // 3) Référence du paiement côté fournisseur (le webhook la cite à l'appui).
  const orderRes = await fetch(
    `${env.apiUrl}/rest/v1/orders?reference=eq.${created.reference}&select=id`,
    { headers: serviceHeaders },
  );
  const [order] = (await orderRes.json()) as { id: string }[];
  if (!order) throw new Error("commande E2E introuvable en base");
  const paymentsRes = await fetch(
    `${env.apiUrl}/rest/v1/payments?order_id=eq.${order.id}&select=id,provider_reference,amount_da,status`,
    { headers: serviceHeaders },
  );
  const [payment] = (await paymentsRes.json()) as {
    id: string;
    provider_reference: string;
    amount_da: number;
    status: string;
  }[];
  if (!payment) throw new Error("paiement E2E introuvable en base");
  expect(payment.status).toBe("pending");
  expect(payment.provider_reference).toMatch(/^fake-/);

  // 4) Notification webhook signée (HMAC « ts.corps », comme le vrai M7).
  const ts = String(Math.floor(Date.now() / 1000));
  const webhookBody = JSON.stringify({
    id: `evt-e2e-${Date.now()}`,
    type: "payment.confirmed",
    payment_ref: payment.provider_reference,
    amount_da: payment.amount_da,
  });
  const webhookRes = await request.post("/api/payments/webhook/fake", {
    data: webhookBody,
    headers: {
      "Content-Type": "application/json",
      "x-signature": fakeWebhookSignature(ts, webhookBody),
      "x-timestamp": ts,
    },
  });
  expect(webhookRes.status()).toBe(200);
  expect(((await webhookRes.json()) as { status: string }).status).toBe("processed");

  // 5) La page de statut (jeton en URL) affiche le statut confirmé.
  await page.goto(`/fr/orders/status?token=${created.statusToken}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Paiement confirmé")).toBeVisible();
  await expect(page.getByText(created.reference)).toBeVisible();

  // Nettoyage : enfants cascade (paiements/transitions/entitlements/consents).
  await fetch(`${env.apiUrl}/rest/v1/orders?id=eq.${order.id}`, {
    method: "DELETE",
    headers: serviceHeaders,
  });
  await fetch(`${env.apiUrl}/rest/v1/customers?email=eq.${email.toLowerCase()}`, {
    method: "DELETE",
    headers: serviceHeaders,
  });
});

test("statut inconnu, expiré ou tronqué ⇒ page neutre identique", async ({ page }) => {
  await page.goto("/fr/orders/status?token=jeton-invalide-aaaaaaaaaaaaaaaaaaaaaaaaa");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Commande non disponible")).toBeVisible();
  // Aucun détail d'erreur technique à l'écran.
  await expect(page.getByText(/erreur|exception/i)).toHaveCount(0);
});
