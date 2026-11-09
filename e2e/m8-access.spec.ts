import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { PDFDocument } from "@cantoo/pdf-lib";
import { totp } from "../tests/helpers/totp";
import { extractPdfText } from "../tests/helpers/pdf-text";
import { createStatusToken, hashStatusToken } from "../src/lib/payments/status-token";

/**
 * M8 — E2E « livraison sécurisée des PDF & accès client minimal »
 * (dev UNIQUEMENT, fournisseur fake imposé par la config Playwright) :
 *
 *   dépôt du fichier Starter (procédure docs/offer-files-depot.md)
 *   → commande + preuve + confirmation admin (MFA TOTP)
 *   → e-mail « accès aux PDF » CAPTURÉ via MAILER_CAPTURE_FILE (GoTrue
 *     n'envoie rien : le Mailer est la seule voie — bloc 6a)
 *   → sans session : /fr/account neutre (aucun formulaire e-mail)
 *   → lien de connexion réel : GET n consomme rien, POST ouvre la session
 *   → /fr/account : commande, statut EXACT, reçu, PDF via le droit serveur
 *   → PDF FILIGRANÉ (référence + nom latin + téléphone MASQUÉ, jamais le
 *     numéro complet) + en-têtes anti-cache
 *   → URL devinée : 401 sans session, 404 IDENTIQUE avec session
 *   → bouton « Accéder à mon espace » : réponse neutre + 2e e-mail réel.
 *
 * Base fraîche garantie par le global setup (`supabase db reset`, local
 * uniquement — e2e/global-setup.ts) avant CHAQUE run : aucun purgatif en
 * début ni en fin de test, et AUCUN chemin de suppression sur les tables
 * append-only `audit_logs` / `payment_transitions` (invariants conservés).
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

/** Sink JSONL du CaptureMailer (MAILER_CAPTURE_FILE — voir playwright.config). */
const CAPTURE_FILE = "test-results/mailer-capture.ndjson";

type CapturedMail = {
  to: string;
  subjectKey: string;
  subject?: string;
  text?: string;
  at: string;
};

function readCaptured(): CapturedMail[] {
  if (!existsSync(CAPTURE_FILE)) return [];
  return readFileSync(CAPTURE_FILE, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CapturedMail);
}

async function restGet(request: APIRequestContext, path: string): Promise<unknown[]> {
  const res = await request.get(`${env.apiUrl}/rest/v1/${path}`, { headers: serviceHeaders });
  expect(res.status()).toBe(200);
  return (await res.json()) as unknown[];
}

test("M8 E2E : dépôt fichier → confirmation → e-mail capturé → lien → espace → PDF filigrané", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  // ── Global setup (playwright.config) a fait le `supabase db reset` : la
  // base repart des migrations, aucun purgatif n'est nécessaire ici —
  // ni en fin de test (aucun « nettoyage » : la base locale est effacée
  // avant le run suivant, et les invariants append-only sur audit_logs /
  // payment_transitions restent intacts).

  const stamp = Date.now();
  const email = `e2e-m8-${stamp}@test.tkf`;
  const adminEmail = `e2e-admin-m8-${stamp}@test.tkf`;
  const adminPassword = `Str0ng-${stamp}-aal2`;
  const idempotencyKey = `e2e-m8-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `starter/e2e-${stamp}.pdf`;
  const phone = "+213555123456";

  // La capture du Mailer est déjà tronquée par le global setup.
  const state = {
    reference: "" as string,
    orderId: "" as string,
    paymentId: "" as string,
    customerUserId: "" as string,
    email,
    storagePath,
  };

  try {
    // ── 1) Dépôt du fichier Starter (procédure docs/offer-files-depot.md) ─
    const doc = await PDFDocument.create();
    const pdfPage = doc.addPage([420, 595]);
    pdfPage.drawText("CONTENU DU PROGRAMME STARTER (E2E)", { x: 40, y: 500, size: 13 });
    const pdfBytes = await doc.save();

    const uploadRes = await fetch(
      `${env.apiUrl}/storage/v1/object/offer-files/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: env.serviceRoleKey,
          Authorization: `Bearer ${env.serviceRoleKey}`,
          "Content-Type": "application/pdf",
        },
        body: Buffer.from(pdfBytes),
      },
    );
    expect(uploadRes.status).toBe(200);

    const offers = await restGet(request, "offers?slug=eq.starter&select=id");
    const offerId = (offers[0] as { id: string }).id;
    expect(offerId).toBeTruthy();
    const fileRes = await request.post(`${env.apiUrl}/rest/v1/offer_files`, {
      headers: { ...serviceHeaders, Prefer: "return=representation" },
      data: {
        offer_id: offerId,
        storage_path: storagePath,
        label: "Programme d'entraînement (PDF)",
      },
    });
    expect([200, 201]).toContain(fileRes.status());
    // PostgREST renvoie un TABLEAU pour un insert avec return=representation.
    const inserted = (await fileRes.json()) as Array<{ id: string }>;
    const offerFileId = Array.isArray(inserted) ? inserted[0]?.id : undefined;
    expect(offerFileId, "id offer_files absent de la réponse").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // ── 2) Admin réel (compte + rôle) + session cookie @supabase/ssr ─────
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

    // ── 3) Commande réelle (fournisseur fake) + preuve ────────────────────
    const createRes = await request.post("/api/orders", {
      data: {
        offerSlug: "starter",
        name: "E2E M8",
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
    state.reference = created.reference;

    const proofRes = await request.post(`/api/orders/${created.reference}/proof`, {
      multipart: { statusToken: created.statusToken, txn: `E2EM8${String(stamp).slice(-6)}` },
    });
    expect(proofRes.status()).toBe(200);

    // ── 4) Confirmation admin (MFA TOTP, même chemin que M7a) ─────────────
    const orderRows = await restGet(
      request,
      `orders?reference=eq.${created.reference}&select=id`,
    );
    state.orderId = (orderRows[0] as { id: string }).id;
    const paymentRows = await restGet(
      request,
      `payments?order_id=eq.${state.orderId}&select=id`,
    );
    state.paymentId = (paymentRows[0] as { id: string }).id;

    const enrollRes = await page.request.post("/api/admin/mfa/enroll");
    expect(enrollRes.status()).toBe(200);
    const enroll = (await enrollRes.json()) as { factorId: string; secret: string };
    const verifyRes = await page.request.post("/api/admin/mfa/verify", {
      data: { factorId: enroll.factorId, code: totp(enroll.secret) },
    });
    expect(verifyRes.status()).toBe(200);

    const confirmRes = await page.request.post(
      `/api/admin/payments/${state.paymentId}/confirm`,
      { data: { amountDa: created.total_da } },
    );
    expect(confirmRes.status()).toBe(200);
    expect(((await confirmRes.json()) as { unchanged: boolean }).unchanged).toBe(false);

    // ── 5) Notification « accès aux PDF » : outbox idempotente + mail capturé
    const outbox = await restGet(
      request,
      `email_outbox?payment_id=eq.${state.paymentId}&event_type=eq.pdf_access&select=event_type,status,recipient`,
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      event_type: "pdf_access",
      status: "sent",
      recipient: email,
    });

    // Rejeu de confirmation : AUCUN second envoi (unique payment_id+type).
    const replayRes = await page.request.post(
      `/api/admin/payments/${state.paymentId}/confirm`,
      { data: { amountDa: created.total_da } },
    );
    expect(replayRes.status()).toBe(200);
    expect(((await replayRes.json()) as { unchanged: boolean }).unchanged).toBe(true);
    const outboxAfter = await restGet(
      request,
      `email_outbox?payment_id=eq.${state.paymentId}&event_type=eq.pdf_access&select=id`,
    );
    expect(outboxAfter).toHaveLength(1);

    // Téléphone du client (filigrane : TOUJOURS masqué, jamais le numéro).
    const patchRes = await request.patch(`${env.apiUrl}/rest/v1/customers?email=eq.${email}`, {
      headers: serviceHeaders,
      data: { phone },
    });
    expect(patchRes.status()).toBe(204);

    // L'e-mail capturé est le VRAI mail envoyé par l'application.
    const accessMails = readCaptured().filter(
      (m) => m.subjectKey === "account.accessEmail" && m.to === email,
    );
    expect(accessMails).toHaveLength(1);
    const mailText = accessMails[0]?.text ?? "";
    expect(mailText).toContain("/auth/confirm?token_hash=");
    // Jamais de fichier ni de lien de téléchargement dans l'e-mail.
    expect(mailText).not.toContain("/api/downloads");
    expect(mailText).not.toContain(".pdf");
    const linkMatch = mailText.match(/http:\/\/localhost:3000\/auth\/confirm\?[^\s]+/);
    expect(linkMatch, "lien de connexion absent de l'e-mail").toBeTruthy();
    const magicUrl = linkMatch?.[0] as string;

    // ── 6) Sans session : /fr/account neutre (aucun formulaire e-mail) ────
    await page.context().clearCookies();
    await page.goto("/fr/account");
    await expect(page.getByRole("heading", { name: "Espace client" })).toBeVisible();
    expect(await page.locator("input[type='email']").count()).toBe(0);

    // ── 7) Lien de connexion : GET n consomme rien, POST ouvre la session ─
    await page.goto(magicUrl);
    const signInButton = page.getByRole("button", { name: "Se connecter" });
    await expect(signInButton).toBeVisible();
    await page.reload(); // le GET est idempotent : le jeton reste intact
    await expect(signInButton).toBeVisible();
    await signInButton.click();
    await expect(page).toHaveURL(/\/fr\/account$/);

    // ── 8) Espace client : statut EXACT, reçu, PDF listé ──────────────────
    await expect(page.getByText(created.reference)).toBeVisible();
    await expect(page.getByText("Paiement confirmé").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mes PDF", exact: true })).toBeVisible();
    const fileLink = page.getByRole("link", { name: "Programme d'entraînement (PDF)" });
    await expect(fileLink).toBeVisible();
    const downloadHref = (await fileLink.getAttribute("href")) ?? "";
    expect(downloadHref).toMatch(/^\/api\/downloads\/[0-9a-f-]{36}\?file=[0-9a-f-]{36}$/);
    await expect(page.getByRole("link", { name: "Télécharger le reçu" })).toBeVisible();

    // Reçu par session (branche M8 de la route).
    const receipt = await page.request.get(`/api/orders/${created.reference}/receipt`);
    expect(receipt.status()).toBe(200);
    expect(receipt.headers()["content-type"]).toBe("application/pdf");

    // ── 9) Téléchargement : PDF filigrané + en-têtes anti-cache ───────────
    const download = await page.request.get(downloadHref);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toBe("application/pdf");
    expect(download.headers()["cache-control"]).toContain("private");
    expect(download.headers()["cache-control"]).toContain("no-store");
    expect(download.headers()["content-disposition"]).toContain(".pdf");
    const pdfBody = await download.body();
    expect(pdfBody.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const pdfText = extractPdfText(pdfBody);
    expect(pdfText).toContain(`TEEKAY FIT — Commande ${created.reference}`);
    expect(pdfText).toContain("E2E M8"); // nom latin ⇒ apposé
    expect(pdfText).toContain("+213 *** *** 456"); // téléphone MASQUÉ
    expect(pdfText).not.toContain(phone); // jamais le numéro complet

    // ── 10) URL devinée : 401 sans session, 404 IDENTIQUE avec session ────
    const guessed = "00000000-0000-4000-8000-000000000000";
    const anonymous = await request.get(`/api/downloads/${guessed}`);
    expect(anonymous.status()).toBe(401);
    expect(((await anonymous.json()) as { error: string }).error).toBe("connexion_requise");
    const withSession = await page.request.get(`/api/downloads/${guessed}`);
    expect(withSession.status()).toBe(404);
    expect(((await withSession.json()) as { error: string }).error).toBe("not_found");

    // ── 11) Bouton « Accéder à mon espace » : réponse neutre + 2e e-mail ──
    const bogus = await page.request.post("/api/auth/access", {
      data: { statusToken: "B".repeat(24) },
    });
    expect(bogus.status()).toBe(200);
    expect(await bogus.json()).toEqual({ ok: true }); // jeton inconnu : identique

    const freshToken = createStatusToken().token;
    const renewRes = await request.post(`${env.apiUrl}/rest/v1/rpc/renew_order_status_token`, {
      headers: serviceHeaders,
      data: {
        p_order_id: state.orderId,
        p_new_status_token_hash: hashStatusToken(freshToken),
        p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(renewRes.status()).toBe(204);
    await page.goto(`/fr/orders/status?token=${freshToken}`);
    await expect(page.getByText("Paiement confirmé").first()).toBeVisible();
    await page.getByRole("button", { name: "Accéder à mon espace" }).click();
    await expect(page.getByRole("status")).toContainText("Demande enregistrée");

    const accessMailsAfter = readCaptured().filter(
      (m) => m.subjectKey === "account.accessEmail" && m.to === email,
    );
    expect(accessMailsAfter).toHaveLength(2); // 2e envoi réel via le Mailer
    expect(accessMailsAfter[1]?.text).toContain("/auth/confirm?token_hash=");
    expect(accessMailsAfter[1]?.text).not.toContain("/api/downloads");
  } finally {
    // AUCUN nettoyage (global setup : `supabase db reset` avant chaque run).
    // Aucun chemin de suppression sur audit_logs / payment_transitions.
  }
});
