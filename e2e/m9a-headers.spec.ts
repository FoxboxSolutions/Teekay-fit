import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totp } from "../tests/helpers/totp";

/**
 * M9a (g, fin) — En-têtes de protection sur TOUTES les réponses /admin.
 *
 * MODE DE SERVEUR EXPLICITE (jamais deviné) : PW_SERVER_MODE=dev|prod.
 * Contrat constaté par mesure (étape 3 du rapport M9a) :
 *  - PRODUCTION : pages ET routes API → `Cache-Control: private, no-store`
 *    + `X-Robots-Tag: noindex, nofollow` (6/6 requêtes conformes) ;
 *  - `next dev` : les routes API gardent `private, no-store`, mais next dev
 *    ÉCRASE `private` sur les PAGES — mesure : `Cache-Control: no-store`
 *    seul sur /fr/admin, /fr/admin/mfa, /fr/admin/a-traiter et
 *    /fr/admin/payments (X-Robots-Tag identique partout).
 * L'assertion reste STRICTE dans les deux modes : en dev, on exige aussi
 * l'ABSENCE de `private` sur les pages (contrat dev = `no-store` seul).
 * PW_SERVER_MODE absent/invalide → le test échoue au chargement (voir plus
 * bas) ; un garde-fou beforeAll refuse un serveur qui ne correspond pas au
 * mode déclaré.
 *
 * Chaque réponse est appelée sur le VRAI serveur et doit porter les deux
 * en-têtes, QUEL QUE SOIT le statut (200, 307, 401, 403, 400, 404) :
 *   - Cache-Control qui contient `no-store` (+ `private` en prod et sur les
 *     routes API dans les deux modes)
 *   - X-Robots-Tag qui contient `noindex` ET `nofollow`
 *
 * Quatre situations — attentes lues dans le code (citations) :
 *
 *  1. SANS session        → 401 unauthenticated sur les 11 routes
 *                           (session.ts l.148 / l.164) ; pages : 307 vers
 *                           /{locale}/admin/mfa (redirect() des pages
 *                           dashboard l.75, a-traiter l.82, leads l.96,
 *                           clients l.76), sauf /paiements (200 bloqué,
 *                           l.35-50 du composant) et /mfa (200, l.39-47).
 *  2. ADMIN aal1          → routes mfa joignables : requireAdmin
 *                           ({requireMfa:false}) l.145-152 → enroll 200,
 *                           verify/recovery 400 invalid_code (l.32-33 /
 *                           l.36-37 puis l.69-73 / l.65-69) ; les 8 autres
 *                           routes → 403 mfa_required (l.166) ; pages →
 *                           défi MFA (307) sauf /mfa 200 et /paiements 200
 *                           bloqué (aucune donnée affichée).
 *  3. CLIENT non admin    → 403 not_admin sur les 11 routes (l.149/l.165) ;
 *                           les 6 pages répondent 200 avec l'affichage
 *                           NEUTRE « not_admin » (branche anticipée des
 *                           pages, aucun contenu autorisé).
 *  4. ADMIN aal2 (TOTP)   → 200 sur les routes et pages qui doivent
 *                           répondre 200 ; ids fictifs → 404 not_found
 *                           (après garde), codes invalides → 400.
 *
 * Le catalogue i18n complet est sérialisé dans le payload RSC de chaque
 * page (NextIntlClientProvider du layout racine) : les assertions de
 * contenu utilisent donc `body.innerText` (hors <script>), jamais le HTML
 * brut, pour rester non vacues et non fausses.
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

/**
 * Mode de serveur explicite — jamais deviné. PW_SERVER_MODE=dev|prod ;
 * absent ou invalide → le chargement du fichier échoue avec ce message.
 */
const SERVER_MODE = process.env.PW_SERVER_MODE;
if (SERVER_MODE !== "dev" && SERVER_MODE !== "prod") {
  throw new Error(
    `PW_SERVER_MODE absent ou invalide (reçu : ${JSON.stringify(SERVER_MODE)}). ` +
      `Définissez PW_SERVER_MODE=dev (next dev) ou PW_SERVER_MODE=prod ` +
      `(npm start, build de production) avant de lancer ce test.`,
  );
}

/**
 * Assertions STRICTES (plus de expect.soft) — le comportement attendu dépend
 * du mode déclaré :
 *  - prod : pages ET routes API → Cache-Control contient `private` ET
 *    `no-store` (mesure : les 6 requêtes de l'étape 3a) ;
 *  - dev : routes API → valeurs complètes ; pages → `no-store` SANS
 *    `private` (mesure étape 3b : next dev impose `Cache-Control: no-store`
 *    sur les pages, écrasant le `private` de next.config.ts — c'est un
 *    artefact du serveur de dev, pas un défaut de production) ;
 *  - dans les deux modes : X-Robots-Tag contient `noindex` ET `nofollow`.
 */
function assertProtectiveHeaders(
  res: { headers(): Record<string, string> },
  kind: "page" | "api",
): void {
  const h = res.headers();
  const cc = h["cache-control"] ?? "(absent)";
  const xr = h["x-robots-tag"] ?? "(absent)";
  expect(cc, `Cache-Control (${kind}, ${SERVER_MODE}): ${cc}`).toContain("no-store");
  expect(xr, `X-Robots-Tag (${kind}, ${SERVER_MODE}): ${xr}`).toContain("noindex");
  expect(xr, `X-Robots-Tag (${kind}, ${SERVER_MODE}): ${xr}`).toContain("nofollow");
  const expectsPrivate = SERVER_MODE === "prod" || kind === "api";
  if (expectsPrivate) {
    expect(cc, `Cache-Control (${kind}, ${SERVER_MODE}): ${cc}`).toContain("private");
  } else {
    // dev + page : next dev impose `no-store` seul (mesure citée ci-dessus).
    // On exige l'ABSENCE de `private` pour rester strict sur le contrat dev.
    expect(
      cc,
      `Cache-Control (page, dev) : « ${cc} » ne doit PAS contenir ` +
        `« private » (next dev écrase l'en-tête des pages)`,
    ).not.toContain("private");
  }
}

type RouteCall = { method: "GET" | "POST"; path: string; body?: unknown };

/** Les 3 routes de défi MFA : requireAdmin({requireMfa:false}) — joignables à aal1. */
const MFA_ENROLL: RouteCall = { method: "POST", path: "/api/admin/mfa/enroll", body: {} };
const MFA_VERIFY: RouteCall = {
  method: "POST",
  path: "/api/admin/mfa/verify",
  body: { factorId: "f1", code: "000000" },
};
const MFA_RECOVERY: RouteCall = {
  method: "POST",
  path: "/api/admin/mfa/recovery",
  body: { code: "AAAAA-BBBBB" },
};

/** Les 8 autres routes /api/admin/* : requireAdminAal2. */
const OTHER_ROUTES: RouteCall[] = [
  { method: "GET", path: "/api/admin/payments" },
  {
    method: "POST",
    path: "/api/admin/payments/test-id/confirm",
    body: { amountDa: 1000 },
  },
  {
    method: "POST",
    path: "/api/admin/payments/test-id/reject",
    body: { reason: "test" },
  },
  {
    method: "POST",
    path: "/api/admin/leads/test-id/status",
    body: { status: "contacted" },
  },
  { method: "POST", path: "/api/admin/leads/test-id/convert", body: {} },
  { method: "POST", path: "/api/admin/leads/test-id/notes", body: { notes: "test" } },
  { method: "POST", path: "/api/admin/outbox/test-id/resend", body: {} },
  // M9a point (f) — consultation PAR-Q à la demande (audit avant lecture).
  // orderId fictif au FORMAT UUID : la validation stricte passe, la commande
  // est introuvable → 404 not_found (comme les autres routes à id fictif).
  {
    method: "POST",
    path: "/api/admin/par-q",
    body: { orderId: "11111111-2222-4333-8444-555555555555" },
  },
];

/** Les 11 routes /api/admin/* (liste blanche — miroir de tests/admin-headers). */
const ALL_ROUTES: RouteCall[] = [MFA_ENROLL, MFA_VERIFY, MFA_RECOVERY, ...OTHER_ROUTES];

/** 4 pages dont la garde redirige vers /{locale}/admin/mfa (sauf branche not_admin). */
const REDIRECT_PAGES = [
  "/fr/admin",
  "/fr/admin/a-traiter",
  "/fr/admin/leads",
  "/fr/admin/clients",
];
/** 2 pages qui RÉPONDENT 200 même sans aal2 (affichage bloqué/neutre). */
const PAYMENTS_PAGE = "/fr/admin/payments";
const MFA_PAGE = "/fr/admin/mfa";
const ALL_PAGES = [...REDIRECT_PAGES, PAYMENTS_PAGE, MFA_PAGE];

async function callRoute(ctx: APIRequestContext, route: RouteCall) {
  return ctx.fetch(route.path, {
    method: route.method,
    headers: { "Content-Type": "application/json" },
    ...(route.body !== undefined ? { data: route.body } : {}),
  });
}

async function createUser(
  request: APIRequestContext,
  withAdminRole: boolean,
): Promise<{ email: string; password: string; id: string }> {
  const stamp = Date.now();
  const suffix = withAdminRole ? "admin" : "client";
  const email = `e2e-headers-${suffix}-${stamp}@test.tkf`;
  const password = `Str0ng-${stamp}-${suffix}`;
  const res = await request.post(`${env.apiUrl}/auth/v1/admin/users`, {
    headers: serviceHeaders,
    data: { email, password, email_confirm: true },
  });
  expect([200, 201]).toContain(res.status());
  const user = (await res.json()) as { id: string };
  if (withAdminRole) {
    const roleRes = await request.post(`${env.apiUrl}/rest/v1/user_roles`, {
      headers: serviceHeaders,
      data: { user_id: user.id, role: "admin" },
    });
    expect([200, 201]).toContain(roleRes.status());
  }
  return { email, password, id: user.id };
}

async function grantSession(
  request: APIRequestContext,
  email: string,
  password: string,
  userId: string,
): Promise<string> {
  const grantRes = await request.post(`${env.apiUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.anonKey, "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(grantRes.status()).toBe(200);
  const grant = (await grantRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return JSON.stringify({
    access_token: grant.access_token,
    refresh_token: grant.refresh_token,
    token_type: "bearer",
    expires_in: grant.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + grant.expires_in,
    user: { id: userId },
  });
}

async function injectSessionCookie(page: Page, sessionJson: string): Promise<void> {
  await page.context().addCookies([
    {
      name: AUTH_COOKIE,
      // Encodage serveur par défaut d'@supabase/ssr : base64url + préfixe.
      value: `base64-${Buffer.from(sessionJson).toString("base64url")}`,
      url: "http://localhost:3000",
    },
  ]);
}

test.describe("M9a (g) — en-têtes no-store/noindex sur toutes les réponses /admin", () => {
  test.beforeAll(async ({ playwright }) => {
    // Garde-fou du mode : le serveur sur lequel on tourne doit correspondre
    // à PW_SERVER_MODE. /fr/admin/mfa répond 200 dans les deux modes (défi
    // toujours joignable) et porte l'en-tête qui trahit le mode réel.
    const api = await playwright.request.newContext({ baseURL: "http://localhost:3000" });
    const res = await api.get("/fr/admin/mfa");
    expect(res.status(), "le serveur doit répondre sur /fr/admin/mfa").toBe(200);
    const cc = res.headers()["cache-control"] ?? "(absent)";
    await api.dispose();
    if (SERVER_MODE === "prod") {
      expect(
        cc,
        `PW_SERVER_MODE=prod mais le serveur ne renvoie pas « private » ` +
          `(${cc}) : c'est un serveur de DÉVELOPPEMENT. Démarrez ` +
          `npm run build + npm start avant ce run.`,
      ).toContain("private");
    } else {
      expect(
        cc,
        `PW_SERVER_MODE=dev mais le serveur renvoie « private » (${cc}) : ` +
          `c'est un serveur de PRODUCTION. Arrêtez-le (next dev doit être ` +
          `géré par Playwright).`,
      ).not.toContain("private");
    }
  });

  test("sans session : 401 sur les 11 routes, pages 307 ou 200 neutre, en-têtes protecteurs", async ({
    page,
  }) => {
    // Aucun cookie injecté → contexte vierge, pas de session.
    for (const route of ALL_ROUTES) {
      const res = await callRoute(page.request, route);
      expect(res.status(), `${route.method} ${route.path} sans session`).toBe(401);
      expect(((await res.json()) as { error: string }).error).toBe("unauthenticated");
      assertProtectiveHeaders(res, "api");
    }

    for (const path of REDIRECT_PAGES) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `page ${path} sans session`).toBe(307);
      assertProtectiveHeaders(res, "page");
    }

    const payments = await page.request.get(PAYMENTS_PAGE, { maxRedirects: 0 });
    expect(payments.status(), "page paiements sans session (affichage bloqué)").toBe(200);
    assertProtectiveHeaders(payments, "page");

    const mfaPage = await page.request.get(MFA_PAGE, { maxRedirects: 0 });
    expect(mfaPage.status(), "page mfa sans session (message « session requise »)").toBe(200);
    assertProtectiveHeaders(mfaPage, "page");
  });

  test("admin aal1 : routes mfa joignables (200/400), 8 autres routes 403, pages vers le défi MFA", async ({
    page,
    request,
  }) => {
    const { email, password, id } = await createUser(request, true);
    const sessionJson = await grantSession(request, email, password, id);
    await injectSessionCookie(page, sessionJson);

    // (2) Routes mfa joignables à aal1 (requireAdmin requireMfa:false).
    const enrollRes = await page.request.post("/api/admin/mfa/enroll");
    expect(enrollRes.status(), "enroll à aal1").toBe(200);
    assertProtectiveHeaders(enrollRes, "api");
    const enroll = (await enrollRes.json()) as { factorId: string };
    expect(enroll.factorId).toBeTruthy();

    const verifyRes = await page.request.post("/api/admin/mfa/verify", {
      data: { factorId: enroll.factorId, code: "000000" },
    });
    expect(verifyRes.status(), "verify à aal1 avec code invalide").toBe(400);
    expect(((await verifyRes.json()) as { error: string }).error).toBe("invalid_code");
    assertProtectiveHeaders(verifyRes, "api");

    const recoveryRes = await page.request.post("/api/admin/mfa/recovery", {
      data: { code: "AAAAA-BBBBB" },
    });
    expect(recoveryRes.status(), "recovery à aal1 avec code invalide").toBe(400);
    expect(((await recoveryRes.json()) as { error: string }).error).toBe("invalid_code");
    assertProtectiveHeaders(recoveryRes, "api");

    // (3) Les 8 autres routes refusent à aal1 (requireAdminAal2 → 403).
    for (const route of OTHER_ROUTES) {
      const res = await callRoute(page.request, route);
      expect(res.status(), `${route.method} ${route.path} à aal1`).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe("mfa_required");
      assertProtectiveHeaders(res, "api");
    }

    // (1) Pages : redirection 307 vers /{locale}/admin/mfa ; /paiements
    // répond 200 BLOQUÉ (payments/page.tsx l.35-50 : message + lien vers
    // /mfa, aucune donnée) ; /mfa répond 200 (elle est le défi lui-même).
    for (const path of REDIRECT_PAGES) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `page ${path} à aal1`).toBe(307);
      assertProtectiveHeaders(res, "page");
    }
    const payments = await page.request.get(PAYMENTS_PAGE, { maxRedirects: 0 });
    expect(payments.status(), "page paiements à aal1 (bloquée, pas de données)").toBe(200);
    assertProtectiveHeaders(payments, "page");
    const mfaPage = await page.request.get(MFA_PAGE, { maxRedirects: 0 });
    expect(mfaPage.status(), "page mfa à aal1 (le défi répond)").toBe(200);
    assertProtectiveHeaders(mfaPage, "page");

    // Preuve navigateur : la page tableau de bord ATterrit sur le défi MFA.
    await page.goto("/fr/admin");
    await expect(page).toHaveURL(/\/fr\/admin\/mfa/);
  });

  test("client connecté NON ADMIN : 403 not_admin sur les 11 routes, pages neutres sans contenu autorisé", async ({
    page,
    request,
  }) => {
    const { email, password, id } = await createUser(request, false);
    const sessionJson = await grantSession(request, email, password, id);
    await injectSessionCookie(page, sessionJson);

    // (4a) Toutes les routes refusent : 403 not_admin.
    for (const route of ALL_ROUTES) {
      const res = await callRoute(page.request, route);
      expect(res.status(), `${route.method} ${route.path} non-admin`).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe("not_admin");
      assertProtectiveHeaders(res, "api");
    }

    // (4b) Toutes les pages répondent 200 : affichage neutre (branche
    // not_admin anticipée — jamais de redirection qui trahirait l'existence
    // de la page, jamais de données).
    for (const path of ALL_PAGES) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `page ${path} non-admin`).toBe(200);
      assertProtectiveHeaders(res, "page");
    }

    // (4c) Preuve sur le texte VISIBLE : refus présent, contenu autorisé
    // absent (innerText ignore le payload RSC qui contient tout le
    // catalogue i18n — cf. NextIntlClientProvider du layout racine).
    const pageChecks: Array<{ path: string; refuse: string; interdit: string[] }> = [
      {
        path: "/fr/admin",
        refuse: "Accès réservé aux administrateurs.",
        interdit: ["Indicateurs", "Conversion par offre"],
      },
      {
        path: "/fr/admin/a-traiter",
        refuse: "Accès réservé aux administrateurs.",
        interdit: ["Leads du jour", "Commandes à revoir"],
      },
      {
        path: "/fr/admin/leads",
        refuse: "Accès réservé aux administrateurs.",
        interdit: ["Rechercher par nom ou téléphone"],
      },
      {
        path: "/fr/admin/clients",
        refuse: "Accès réservé aux administrateurs.",
        interdit: ["Aucun client", "Voir la fiche"],
      },
      {
        path: "/fr/admin/payments",
        refuse: "Session non vérifiée. Passez le défi",
        interdit: ["Montant attendu", "Aucun paiement en cours de vérification."],
      },
      {
        path: "/fr/admin/mfa",
        refuse: "Accès réservé aux administrateurs.",
        interdit: ["Activer la double authentification"],
      },
    ];
    for (const check of pageChecks) {
      await page.goto(check.path);
      const body = await page.locator("body").innerText();
      expect(body, `${check.path} : refus visible`).toContain(check.refuse);
      for (const marker of check.interdit) {
        expect(body, `${check.path} : aucun contenu autorisé « ${marker} »`).not.toContain(
          marker,
        );
      }
    }
  });

  test("admin aal2 (défi TOTP réel) : 200 sur les routes et pages qui doivent répondre 200", async ({
    page,
    request,
  }) => {
    const { email, password, id } = await createUser(request, true);
    const sessionJson = await grantSession(request, email, password, id);
    await injectSessionCookie(page, sessionJson);

    // Défi TOTP réel → la session passe à aal2 (cookie mis à jour par la
    // réponse — même chemin que e2e/m7a-payment.spec.ts).
    const enrollRes = await page.request.post("/api/admin/mfa/enroll");
    expect(enrollRes.status()).toBe(200);
    assertProtectiveHeaders(enrollRes, "api");
    const enroll = (await enrollRes.json()) as { factorId: string; secret: string };
    const challenge = await page.request.post("/api/admin/mfa/verify", {
      data: { factorId: enroll.factorId, code: totp(enroll.secret) },
    });
    expect(challenge.status(), "défi TOTP accepté → aal2").toBe(200);
    assertProtectiveHeaders(challenge, "api");

    // Route liste : 200 avec la session aal2.
    const listRes = await page.request.get("/api/admin/payments");
    expect(listRes.status(), "liste paiements à aal2").toBe(200);
    assertProtectiveHeaders(listRes, "api");

    // 6 routes à id fictif : la garde passe, l'entrée est introuvable → 404
    // (confirm/reject exigent un UUID — confirm/route.ts l.44-51 ; les
    // autres .single() en erreur — cf. route.ts concernées).
    for (const route of OTHER_ROUTES.filter((r) => r.method === "POST")) {
      const res = await callRoute(page.request, route);
      expect(res.status(), `${route.method} ${route.path} à aal2 (id fictif)`).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe("not_found");
      assertProtectiveHeaders(res, "api");
    }

    // Codes invalides : 400 après garde (jamais 401/403 à aal2).
    const verifyRes = await page.request.post("/api/admin/mfa/verify", {
      data: { factorId: "f1", code: "000000" },
    });
    expect(verifyRes.status(), "verify code invalide à aal2").toBe(400);
    assertProtectiveHeaders(verifyRes, "api");
    const recoveryRes = await page.request.post("/api/admin/mfa/recovery", {
      data: { code: "AAAAA-BBBBB" },
    });
    expect(recoveryRes.status(), "recovery code invalide à aal2").toBe(400);
    assertProtectiveHeaders(recoveryRes, "api");

    // NB : mfa/enroll n'est pas rappelé ici — un second enrôlement du même
    // facteur renvoie 422 mfa_factor_name_conflict → 500 enroll_failed
    // (comportement GoTrue v2.197.0 vérifié) : l'enrôlement est déjà couvert
    // ci-dessus et dans le test aal1.

    // Les 6 pages répondent 200 avec la session aal2.
    for (const path of ALL_PAGES) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `page ${path} à aal2`).toBe(200);
      assertProtectiveHeaders(res, "page");
    }

    // Preuve navigateur : le contenu autorisé du tableau de bord s'affiche.
    await page.goto("/fr/admin");
    const body = await page.locator("body").innerText();
    expect(body, "tableau de bord autorisé (aal2)").toContain("Indicateurs");
  });
});
