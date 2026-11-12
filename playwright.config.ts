import { defineConfig, devices } from "@playwright/test";
import { MAILER_CAPTURE_PATH } from "./e2e/global-setup";

/**
 * M9a (g) — AJOUT strictement additif : le serveur E2E peut être celui d'un
 * build de PRODUCTION déjà démarré à la main (`npm run build` puis
 * `npm start`), et non le `next dev` lancé par Playwright.
 *
 * Pourquoi : les en-têtes de protection ne sont PAS identiques en dev et en
 * prod (next dev écrase `private` sur les pages), donc le test
 * `e2e/m9a-headers.spec.ts` DOIT tourner contre le bon serveur
 * (PW_SERVER_MODE=dev|prod, jamais deviné).
 *
 * Comportement (rien n'est supprimé, `workers: 1` reste) :
 *  - hors CI (comportement historique inchangé) : un serveur déjà présent
 *    sur http://localhost:3000 est RÉUTILISÉ (jamais deux processus Next
 *    en parallèle) ;
 *  - `PW_REUSE_EXISTING_SERVER=1` : force la réutilisation même en CI
 *    (CI = false ⇒ le serveur de prod déjà démarré est réutilisé au lieu
 *    de lancer `npm run dev`).
 */
const PW_REUSE_EXISTING_SERVER =
  process.env.PW_REUSE_EXISTING_SERVER === "1" || !process.env.CI;

/**
 * E2E Playwright — parcours réels contre `next dev` (clés de test Turnstile
 * autorisées sur localhost, cf. src/lib/security/turnstile.ts).
 *
 * Global setup (correction avant M9) : `supabase db reset` sur la base
 * LOCALE uniquement avant chaque run — remplace toutes les purges manuelles
 * (et le nettoyage best-effort en fin de test). Le setup REFUSE une URL non
 * locale (tests : tests/e2e-global-setup.test.ts).
 */
export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  // M9a : les tests E2E partagent la BASE LOCALE UNIQUE. Le global setup
  // exécute `supabase db reset` avant chaque run, et les tests écrivent
  // réellement (commandes, paiements, leads, outbox…). Exécuter plusieurs
  // workers en parallèle provoquerait des resets concurrents et des courses
  // sur l'état de la base (un test voit les données d'un autre). workers:1
  // est donc OBLIGATOIRE tant qu'aucune base isolée par test n'est mise en
  // place (point ouvert M9b).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: PW_REUSE_EXISTING_SERVER,
    timeout: 120_000,
    // M6 : parcours de commande E2E contre le fournisseur fictif —
    // dev/preview explicite UNIQUEMENT (garde APP_ENV au démarrage).
    env: {
      APP_ENV: "development",
      PAYMENT_PROVIDER: "fake",
      // M7a : e-mails = capture locale (aucun envoi réel en E2E) ;
      // l'outbox marque alors les notifications « sent ».
      MAILER_PROVIDER: "capture",
      // M8 : le Mailer capture aussi en JSONL (bloc 6a) — c'est le seul
      // moyen de lire le VRAI lien de connexion émis (GoTrue generateLink
      // n'envoie aucun e-mail). Chemin partagé avec le global setup, qui
      // le tronque en début de run (déjà ignoré par git : test-results/).
      MAILER_CAPTURE_FILE: MAILER_CAPTURE_PATH,
      // PAYMENT_WEBHOOK_SECRET volontairement absent : le défaut
      // fake-only-local-secret est partagé avec le test (aucun secret réel).
    },
  },
});
