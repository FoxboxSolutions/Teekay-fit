import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck, WHATSAPP_PATTERN, PLACEHOLDER_MARKER } from "../scripts/check-placeholders.mjs";

const VALID_WA = "+213555000000";

let dir: string;
let messagesDir: string;
let manifestPath: string;

function writeMessages(obj: unknown) {
  mkdirSync(messagesDir, { recursive: true });
  writeFileSync(join(messagesDir, "fr.json"), JSON.stringify(obj), "utf8");
}

function writeManifest(obj: unknown) {
  writeFileSync(manifestPath, JSON.stringify(obj), "utf8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tkf-ph-"));
  messagesDir = join(dir, "messages");
  manifestPath = join(dir, "check-manifest.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("check-placeholders", () => {
  it("passe quand aucun placeholder, aucune route comingSoon, WhatsApp valide", () => {
    writeMessages({ home: { title: "TeekayFit", tagline: "Discipline · Ambition · Brotherhood" } });
    writeManifest({ comingSoonRoutes: [], legalRoutes: [] });

    const res = runCheck({ env: { NEXT_PUBLIC_WHATSAPP_NUMBER: VALID_WA }, messagesDir, manifestPath });
    expect(res.ok).toBe(true);
    expect(res.count).toBe(0);
  });

  it("détecte un marqueur placeholder et échoue", () => {
    writeMessages({ about: { bio: `${PLACEHOLDER_MARKER} biographie du coach]` } });
    writeManifest({ comingSoonRoutes: [], legalRoutes: [] });

    const res = runCheck({ env: { NEXT_PUBLIC_WHATSAPP_NUMBER: VALID_WA }, messagesDir, manifestPath });
    expect(res.ok).toBe(false);
    expect(res.count).toBe(1);
    expect(res.placeholders).toHaveLength(1);
    expect(res.placeholders[0]).toContain("about.bio");
  });

  it("détecte une route comingSoon non livrée (ex. /checkout/[offre])", () => {
    writeMessages({ home: { title: "TeekayFit" } });
    writeManifest({ comingSoonRoutes: ["/checkout/[offre]"], legalRoutes: [] });

    const res = runCheck({ env: { NEXT_PUBLIC_WHATSAPP_NUMBER: VALID_WA }, messagesDir, manifestPath });
    expect(res.ok).toBe(false);
    expect(res.comingSoon).toEqual(["/checkout/[offre]"]);
    expect(res.violations.some((v) => v.category === "comingSoon")).toBe(true);
  });

  it("échoue si NEXT_PUBLIC_WHATSAPP_NUMBER est absent", () => {
    writeMessages({ home: { title: "TeekayFit" } });
    writeManifest({ comingSoonRoutes: [], legalRoutes: [] });

    const res = runCheck({ env: {}, messagesDir, manifestPath });
    expect(res.ok).toBe(false);
    expect(res.whatsapp.ok).toBe(false);
    expect(res.violations.some((v) => v.category === "whatsapp")).toBe(true);
  });

  it("échoue si le numéro WhatsApp est hors format international (+213…)", () => {
    writeMessages({ home: { title: "TeekayFit" } });
    writeManifest({ comingSoonRoutes: [], legalRoutes: [] });

    for (const bad of ["0555000000", "+33612345678", "+213555", "555000000"]) {
      const res = runCheck({ env: { NEXT_PUBLIC_WHATSAPP_NUMBER: bad }, messagesDir, manifestPath });
      expect(res.ok, `numéro invalide accepté : ${bad}`).toBe(false);
    }
    expect(WHATSAPP_PATTERN.test(VALID_WA)).toBe(true);
  });

  it("signale explicitement une page légale encore en placeholder", () => {
    writeMessages({
      legal: { privacy: { body: `${PLACEHOLDER_MARKER} texte validé par le propriétaire et un juriste]` } },
      home: { title: "TeekayFit" },
    });
    writeManifest({
      comingSoonRoutes: [],
      legalRoutes: [{ path: "/legal/privacy", messageKey: "legal.privacy" }],
    });

    const res = runCheck({ env: { NEXT_PUBLIC_WHATSAPP_NUMBER: VALID_WA }, messagesDir, manifestPath });
    expect(res.ok).toBe(false);
    const legal = res.categories.find((c) => c.id === "legal");
    expect(legal?.items).toContain("legal.privacy.body");
  });

  it("tolère les espaces dans le numéro WhatsApp au format international", () => {
    writeMessages({ home: { title: "TeekayFit" } });
    writeManifest({ comingSoonRoutes: [], legalRoutes: [] });

    const res = runCheck({
      env: { NEXT_PUBLIC_WHATSAPP_NUMBER: "+213 555 000 000" },
      messagesDir,
      manifestPath,
    });
    expect(res.ok).toBe(true);
  });

  it("strict : exige APP_ENV=production explicite (absente, invalide ou autre valeur)", () => {
    writeMessages({ home: { title: "TeekayFit" } });
    writeManifest({ comingSoonRoutes: [], legalRoutes: [] });

    for (const appEnv of [undefined, "", "development", "preview", "staging"]) {
      const res = runCheck({
        env: { NEXT_PUBLIC_WHATSAPP_NUMBER: VALID_WA, APP_ENV: appEnv },
        messagesDir,
        manifestPath,
        strict: true,
      });
      expect(res.ok, `APP_ENV=${appEnv ?? "absente"} acceptée en strict`).toBe(false);
      expect(res.violations.some((v) => v.category === "appEnv")).toBe(true);
    }

    const ok = runCheck({
      env: { NEXT_PUBLIC_WHATSAPP_NUMBER: VALID_WA, APP_ENV: "production" },
      messagesDir,
      manifestPath,
      strict: true,
    });
    expect(ok.ok).toBe(true);
    expect(ok.count).toBe(0);
  });

  it("non strict : APP_ENV absente n'est pas une violation", () => {
    writeMessages({ home: { title: "TeekayFit" } });
    writeManifest({ comingSoonRoutes: [], legalRoutes: [] });

    const res = runCheck({
      env: { NEXT_PUBLIC_WHATSAPP_NUMBER: VALID_WA },
      messagesDir,
      manifestPath,
    });
    expect(res.ok).toBe(true);
    expect(res.violations.some((v) => v.category === "appEnv")).toBe(false);
  });
});
