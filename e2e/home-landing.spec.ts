import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

/**
 * Landing page — non-régression « sections disparues » (M10 / A7) et
 * accessibilité (B6/B7).
 *
 * Garde-fou central : le contenu est visible dans le HTML serveur, aucune
 * section ne peut être à opacité < 1 au repos (hors animation en cours).
 * Une régression du type `opacity: 0` par défaut sur `.reveal` fait échouer
 * ces tests.
 */

/** Opacité effective = produit des opacités des ancêtres (Framer Motion pose
 *  `opacity` en style inline sur ses îlots). */
async function effectiveOpacity(page: Page) {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll("main > section")];
    const opacityOf = (el: Element) => {
      let o = 1;
      let node: Element | null = el;
      while (node && node !== document.body) {
        o *= Number.parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      return Math.round(o * 100) / 100;
    };
    return sections.map((section) => {
      const cs = getComputedStyle(section);
      const rect = section.getBoundingClientRect();
      const headings = [...section.querySelectorAll("h1, h2, h3, p")];
      return {
        heading: (section.querySelector("h1, h2")?.textContent ?? "").trim().slice(0, 40),
        sectionOpacity: cs.opacity,
        sectionVisibility: cs.visibility,
        sectionDisplay: cs.display,
        inViewport: rect.top < window.innerHeight && rect.bottom > 0,
        // Opacité effective la plus faible des textes de la section
        minTextOpacity: headings.length ? Math.min(...headings.map(opacityOf)) : 1,
      };
    });
  });
}

/** Défilement lent jusqu'en bas (déclenche les révélations au défilement). */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = 200;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(900); // fin des animations (320 ms + marge)
}

const HERO_HEADING = "main h1";

test.describe("accueil — sections visibles (A7)", () => {
  test("au chargement : aucun texte DANS le viewport n'est masqué (règle A6)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(900);

    const rows = await effectiveOpacity(page);
    expect(rows.length, "la page d'accueil doit exposer ses sections").toBeGreaterThanOrEqual(9);
    expect(rows.some((r) => r.inViewport), "au moins une section doit être dans le viewport").toBe(true);

    for (const row of rows) {
      expect(row.sectionDisplay, `section « ${row.heading} » display`).not.toBe("none");
      expect(row.sectionVisibility, `section « ${row.heading} » visibility`).not.toBe("hidden");
      expect(row.sectionOpacity, `section « ${row.heading} » opacity`).toBe("1");
      // A6 : un élément déjà dans le viewport au chargement n'est JAMAIS masqué.
      // (Hors viewport, le masquage client est l'effet E2 lui-même — révélé au
      // défilement, vérifié par le test suivant.)
      if (row.inViewport) {
        expect(row.minTextOpacity, `texte visible de « ${row.heading} » à opacité < 1`).toBe(1);
      }
    }
  });

  test("HTML serveur : aucune règle de masquage, le contenu est servi visible", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBe(true);
    const html = await res.text();

    // Aucun style inline opacity:0 sur le contenu initial.
    expect(html, "opacity:0 dans le HTML serveur").not.toMatch(/opacity:\s*0(?:[;"']|$)/);
    // Aucune règle CSS/attribut de masquage de type reveal.
    expect(html, "classe de masquage reveal").not.toMatch(/class="[^"]*\breveal\b/);
    expect(html, "attribut data-visible").not.toContain("data-visible");
    // Le h1 est présent dans le HTML serveur (contenu critique servi).
    expect(html).toMatch(/<h1[^>]*>/);
    // Visuel hero : AVIF + repli WebP (picture), dimensions explicites,
    // haute priorité, et aucune hydratation sur le chemin critique du LCP.
    expect(html).toMatch(/<source[^>]*image\/avif[^>]*monogram-512\.avif/);
    expect(html).toMatch(/<img[^>]*width="512"[^>]*height="512"/);
    expect(html).toMatch(/<img[^>]*fetchpriority="high"/i);
  });

  test("après défilement : toutes les sections sont révélées à opacité 1", async ({ page }) => {
    await page.goto("/");
    await scrollThrough(page);

    const rows = await effectiveOpacity(page);
    for (const row of rows) {
      expect(row.minTextOpacity, `texte de « ${row.heading} » après défilement`).toBe(1);
    }
  });

  test("capture pleine page : chaque section rend du contenu (pixels non vides)", async ({ page }) => {
    await page.goto("/");
    await scrollThrough(page);

    const sections = page.locator("main > section");
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(9);

    for (let i = 0; i < count; i++) {
      const png = await sections.nth(i).screenshot();
      const stats = await sharp(png).stats();
      const maxChannel = Math.max(...stats.channels.map((c) => c.max));
      expect(
        maxChannel,
        `section #${i} quasi vide dans la capture (aucun pixel clair : max=${maxChannel})`,
      ).toBeGreaterThan(128);
    }

    // Retour en haut avant la capture : un header sticky capturé en position
    // de défilement apparaîtrait au milieu de l'image pleine page.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: "test-results/home-fullpage.png", fullPage: true });
  });

  test("hero visible sans JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(HERO_HEADING)).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir les coaching" }).first()).toBeVisible();

    const rows = await effectiveOpacity(page);
    for (const row of rows) {
      expect(row.minTextOpacity, `sans JS, « ${row.heading} » masqué`).toBe(1);
    }
    await context.close();
  });

  test("reduce motion : contenu au repos à opacité 1, aucun masquage", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(900);

    const rows = await effectiveOpacity(page);
    for (const row of rows) {
      expect(row.minTextOpacity, `reduce motion, « ${row.heading} » masqué`).toBe(1);
    }

    // Aucun transform résiduel sur le hero (entrée désactivée).
    const heroTransform = await page
      .locator("main .hero-rise")
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    expect(heroTransform).toBe("none");
  });

  test("un seul h1, navigation clavier, CTA accessibles", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);

    // Premier Tab : un lien du header reçoit le focus (navigation clavier).
    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["A", "BUTTON"].includes(focusedTag)).toBe(true);

    await expect(page.getByRole("link", { name: "Voir les coaching" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Trouve ton programme" }).first()).toBeVisible();
  });

  test("axe : aucune violation sérieuse ou critique sur l'accueil", async ({ page }) => {
    await page.goto("/");
    await scrollThrough(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking,
      blocking.map((v) => `${v.id} (${v.impact}) : ${v.nodes.length} nœud(s)`).join("\n"),
    ).toEqual([]);
  });

  test("placeholders visibles et marqués (contrôle de contenu)", async ({ page }) => {
    await page.goto("/");
    await scrollThrough(page);
    const placeholders = page.locator("[data-placeholder='true']");
    expect(await placeholders.count()).toBeGreaterThan(0);
    await expect(placeholders.first()).toBeVisible();
  });
});
