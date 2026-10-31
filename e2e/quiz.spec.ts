import { test, expect } from "@playwright/test";

/**
 * M5 — 1er E2E : quiz complet → /results/<jeton> → lead créé (clés de test
 * Turnstile, serveur `next dev`). Le parcours de base valide toute la chaîne
 * UI + API + DB en une passe.
 */

test("quiz → résultat : parcours complet avec captcha de test", async ({ page }) => {
  await page.goto("/fr/quiz");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // 5 questions obligatoires : première option + Suivant.
  for (const name of ["objectif", "niveau", "dispo", "materiel", "preference"]) {
    await page.locator(`input[name="quiz-${name}"]`).first().check();
    await page.getByRole("button", { name: "Suivant" }).click();
  }

  // Budget facultatif → Passer.
  await expect(page.getByRole("button", { name: "Passer" })).toBeVisible();
  await page.getByRole("button", { name: "Passer" }).click();

  // Étape contact.
  const phone = `+2135${String(Date.now()).slice(-8)}`;
  await page.locator("#quiz-name").fill("E2E Playwright");
  await page.locator("#quiz-phone").fill(phone);

  // Consentements : recontact (1er) + 18 ans (3e). Marketing reste décoché.
  const checkboxes = page.getByRole("checkbox");
  await checkboxes.nth(0).click();
  await checkboxes.nth(2).click();

  // Turnstile (clé de test) : se résout sans iframe — le jeton apparaît dans
  // le champ caché du widget.
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/\S+/, {
    timeout: 20_000,
  });
  await page.waitForTimeout(500); // état React (onToken) synchronisé

  await page.getByRole("button", { name: "Voir ma recommandation" }).click();

  await page.waitForURL(/\/fr\/results\/[A-Za-z0-9_-]{20,}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Carte offre : prix en dinars visible sur le résultat.
  await expect(page.getByText(/DA/).first()).toBeVisible();
});

test("résultat inconnu ⇒ page neutre identique (pas de fuite)", async ({ page }) => {
  await page.goto("/fr/results/jeton-invalide-aaaaaaaaaaaaaaaaaaaa");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Ce résultat n'est plus disponible")).toBeVisible();
});
