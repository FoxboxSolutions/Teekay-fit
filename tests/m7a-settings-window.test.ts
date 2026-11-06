import { describe, it, expect } from "vitest";
import { isPaymentWindowExpired } from "@/lib/settings";

/**
 * M7a bloc 7 — fenêtre de paiement (durée configurable en base, défaut 48 h,
 * bloc 1) : fonction pure de décision côté serveur. L'expiration
 * automatique (annulation) reste en M12 (pg_cron) — ici on ne fait
 * qu'AFFICHER le message clair au client.
 */
const NOW = new Date("2026-11-04T12:00:00Z");

describe("isPaymentWindowExpired — fenêtre de paiement configurable", () => {
  it("commande créée il y a 47 h (fenêtre 48 h) ⇒ NON expirée (le formulaire reste affiché)", () => {
    expect(
      isPaymentWindowExpired("2026-11-02T13:00:00Z", 48, NOW),
    ).toBe(false);
  });

  it("commande créée il y a 49 h (fenêtre 48 h) ⇒ expirée (message clair, formulaire retiré)", () => {
    expect(
      isPaymentWindowExpired("2026-11-02T11:00:00Z", 48, NOW),
    ).toBe(true);
  });

  it("fenêtre courte (2 h) : expirée dès 3 h — la durée vient de site_settings", () => {
    expect(
      isPaymentWindowExpired("2026-11-04T08:00:00Z", 2, NOW),
    ).toBe(true);
  });

  it("created_at illisible ⇒ NON expiré (fail-safe : jamais de blocage injuste)", () => {
    expect(isPaymentWindowExpired("pas-une-date", 48, NOW)).toBe(false);
  });
});
