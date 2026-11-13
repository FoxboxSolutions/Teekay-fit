import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "../tests/helpers/totp";

/**
 * M9b (d) — E2E navigation du dashboard admin (données fictives, admin aal2
 * réel — même chemin que e2e/m9a-headers.spec.ts) :
 *
 *   1. charger /fr/admin ;
 *   2. collecter TOUS les a[href] de la page (échec si liste vide) ;
 *   3. suivre chaque lien un par un : JAMAIS 404, URL finale sous /fr/admin.
 *
 * Défaut corrigé : les hrefs relatifs (« ./a-traiter », « ./paiements »…)
 * se résolvaient depuis /fr/admin en /fr/a-traiter etc. = 404, et le lien
 * « Commandes » pointait vers ./clients (aucune page Commandes — lien
 * retiré, point ouvert documenté).
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

async function injectSessionCookie(page: Page, sessionJson: string): Promise<void> {
  await page.context().addCookies([
    {
      name: AUTH_COOKIE,
      // Encodage serveur par défaut d'@supabase/ssr : base64url + préfixe.
      value: `base64-${Buffer.from(sessionJson).toString("base64url")}`,
      url: BASE,
    },
  ]);
}

test("M9b (d) E2E : /fr/admin → chaque lien de la page répond sans 404 et reste sous /fr/admin", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const adminEmail = `e2e-admin-nav-${stamp}@test.tkf`;
  const adminPassword = `Str0ng-${stamp}-aal2`;

  // ── 1) Admin réel + rôle (service-role) ─────────────────────────────────
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

  // ── 2) Session admin (cookie @supabase/ssr) puis défi TOTP réel ─────────
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
  await injectSessionCookie(page, sessionJson);

  const enrollRes = await page.request.post("/api/admin/mfa/enroll");
  expect(enrollRes.status()).toBe(200);
  const enroll = (await enrollRes.json()) as { factorId: string; secret: string };
  expect(enroll.factorId).toBeTruthy();
  const verifyRes = await page.request.post("/api/admin/mfa/verify", {
    data: { factorId: enroll.factorId, code: totp(enroll.secret) },
  });
  expect(verifyRes.status(), "défi TOTP accepté → aal2").toBe(200);

  // ── 3) /fr/admin : collecte de TOUS les a[href] ─────────────────────────
  await page.goto("/fr/admin");
  await expect(page.getByRole("heading", { name: "Tableau de bord", exact: true })).toBeVisible();
  const hrefs = await page.$$eval("a[href]", (as) =>
    as.map((a) => a.getAttribute("href")).filter((h): h is string => h !== null),
  );
  expect(
    hrefs.length,
    `la liste de liens ne doit pas être vide (reçu : ${JSON.stringify(hrefs)})`,
  ).toBeGreaterThan(0);
  // Aucun href relatif « ./ » dans le DOM rendu.
  for (const href of hrefs) {
    expect(href.startsWith("./"), `aucun href relatif « ./ » (reçu : ${href})`).toBe(false);
  }

  // ── 4) Chaque lien suivi un par un : jamais 404, finale sous /fr/admin ──
  for (const href of hrefs) {
    const absolute = new URL(href, page.url()).toString();
    const res = await request.get(absolute);
    expect(
      res.status(),
      `${href} (résolu : ${absolute}) ne doit jamais répondre 404`,
    ).not.toBe(404);
    expect(
      res.url(),
      `${href} : l'URL finale doit rester sous /fr/admin (reçu : ${res.url()})`,
    ).toContain(`${BASE}/fr/admin`);
  }
});
