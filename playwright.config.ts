import { defineConfig, devices } from "@playwright/test";
import { MAILER_CAPTURE_PATH } from "./e2e/global-setup";

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
    reuseExistingServer: !process.env.CI,
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
