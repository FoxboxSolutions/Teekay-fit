import { test, expect } from "@playwright/test";

/**
 * Accueil — captures E2E aux trois viewports (B7 : 390, 768, 1440 px),
 * données fictives de la base locale (seed du `supabase db reset` du
 * global setup). Vérifie aussi l'absence de débordement horizontal et
 * l'unicité du h1 à chaque largeur.
 */

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablette-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

for (const vp of VIEWPORTS) {
  test(`accueil ${vp.width}px : rendu complet, h1 unique, pas de débordement`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 200) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      overflow.scrollWidth,
      `débordement horizontal (${overflow.scrollWidth} > ${overflow.innerWidth})`,
    ).toBeLessThanOrEqual(overflow.innerWidth + 1);

    const sections = page.locator("main > section");
    expect(await sections.count()).toBeGreaterThanOrEqual(9);
    await expect(sections.last()).toBeVisible();

    await page.screenshot({
      path: `test-results/home-${vp.name}.png`,
      fullPage: true,
    });
  });
}
