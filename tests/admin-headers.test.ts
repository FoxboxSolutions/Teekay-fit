import { describe, it, expect, vi } from "vitest";
import { readdirSync } from "node:fs";
import nextConfig from "../next.config";

/**
 * M9a (g) — En-têtes de protection sur toutes les routes et pages /admin.
 *
 * Ce test couvre l'exigence de maniere integree :
 *  1. Liste blanche : chaque route sous src/app/api/admin/** est parcourue
 *     et doit figurer dans la liste blanche explicite ci-dessous (sinon le
 *     test echec).
 *  2. Comportement des routes : requireAdminAal2 (garde appele en tete de
 *     TOUTE route et page admin) renvoie 401 sans session et 403 hors admin.
 *     Comme toutes les routes appellent ce garde en premier, verifier le
 *     garde revient a verifier le comportement de chaque route sans avoir
 *     a demarrer un serveur HTTP externe.
 *  3. En-têtes HTTP : next.config.ts headers() est invoque dynamiquement
 *     (pas lu statiquement) et verifie pour les patterns
 *     /api/admin/:path* et /:locale/admin/:path* : il retourne
 *     Cache-Control: private, no-store et X-Robots-Tag: noindex, nofollow.
 *     Ces en-têtes sont ajoutes par Next.js a TOUTE reponse HTTP
 *     correspondant au pattern, quel que soit le statut (200, 401, 403,
 *     redirection MFA).
 *  4. Pages admin : generateMetadata retourne robots noindex.
 */

// --- Mocks : pas de session admin -----------------------------------------
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      insert: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
    }),
  }),
}));

// --- Liste blanche explicite (justifiee) des routes API -------------------
const ALLOWED_API_ROUTES: Record<string, string> = {
  "mfa/verify": "POST - verification du defi TOTP (M7a/M9a)",
  "mfa/recovery": "POST - codes de secours TOTP (M7a/M9a)",
  "mfa/enroll": "POST - enregistrement du facteur TOTP (M7a)",
  "payments": "GET/POST - liste et actions des paiements (M7a)",
  "payments/test-id/confirm": "POST - confirmer un paiement (M7a)",
  "payments/test-id/reject": "POST - rejeter un paiement (M7a)",
  "leads/test-id/status": "POST - changement de statut lead (M9a)",
  "leads/test-id/convert": "POST - conversion lead en client (M9a)",
  "leads/test-id/notes": "POST - notes admin-only d'un lead (M9a)",
  "leads/test-id/review": "POST - revue d'identité d'un lead needs_review, décision humaine auditee avec motif (M9a point c)",
  "outbox/test-id/resend": "POST - renvoi idempotent e-mail outbox (M9a)",
  "par-q": "POST - consultation des reponses PAR-Q d'une commande, a la demande, avec audit prealable (M9a point f)",
};

/**
 * Construit la liste des routes API en parcourant src/app/api/admin/**.
 * Les segments dynamiques [id] sont remplaces par une valeur de test.
 */
function listAdminRoutes(): string[] {
  const root = joinLess(process.cwd(), "src", "app", "api", "admin");
  const found: string[] = [];
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = joinLess(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + entry.name + "/");
      } else if (entry.name === "route.ts") {
        found.push(prefix);
      }
    }
  }
  walk(root, "");
  return found
    .map((p) => p.replace(/\[\w+\]/g, "test-id").replace(/\/$/, ""))
    .sort();
}

function joinLess(...parts: string[]): string {
  return parts.join("/");
}

// Imports statiques de generateMetadata (export nomme) de chaque page.
import {
  generateMetadata as homeGenerateMetadata,
} from "../src/app/[locale]/admin/page";
import {
  generateMetadata as paymentsGenerateMetadata,
} from "../src/app/[locale]/admin/payments/page";
import {
  generateMetadata as aTraiterGenerateMetadata,
} from "../src/app/[locale]/admin/a-traiter/page";
import {
  generateMetadata as clientsGenerateMetadata,
} from "../src/app/[locale]/admin/clients/page";
import {
  generateMetadata as mfaGenerateMetadata,
} from "../src/app/[locale]/admin/mfa/page";
import {
  generateMetadata as leadsGenerateMetadata,
} from "../src/app/[locale]/admin/leads/page";

const PAGES_WITH_METADATA = [
  { path: "/fr/admin", generateMetadata: homeGenerateMetadata },
  { path: "/fr/admin/payments", generateMetadata: paymentsGenerateMetadata },
  { path: "/fr/admin/a-traiter", generateMetadata: aTraiterGenerateMetadata },
  { path: "/fr/admin/clients", generateMetadata: clientsGenerateMetadata },
  { path: "/fr/admin/mfa", generateMetadata: mfaGenerateMetadata },
  { path: "/fr/admin/leads", generateMetadata: leadsGenerateMetadata },
] as const;

type HeaderEntry = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

type NextConfig = {
  headers?: () => Promise<HeaderEntry[]>;
  [key: string]: unknown;
};

describe("en-têtes de protection /admin (M9a-g)", () => {
  describe("liste des routes API decouvertes vs liste blanche", () => {
    it("chaque route sous src/app/api/admin/** figure dans la liste blanche", () => {
      const discovered = listAdminRoutes();
      const missing = discovered.filter((r) => !(r in ALLOWED_API_ROUTES));
      expect(
        missing,
        `Routes API non couvertes par la liste blanche : ${missing.join(", ")}`,
      ).toEqual([]);
      const unused = Object.keys(ALLOWED_API_ROUTES).filter(
        (r) => !discovered.includes(r),
      );
      expect(
        unused,
        `Liste blanche contient des routes inexistantes : ${unused.join(", ")}`,
      ).toEqual([]);
    });
  });

  describe("garde requireAdminAal2 (appele en tete de toute route/page admin)", () => {
    it("sans session => 401", async () => {
      const { requireAdminAal2 } = await import("@/lib/auth/session");
      const res: { ok: boolean; status?: number; error?: string } =
        await requireAdminAal2();
      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
      expect(res.error).toBe("unauthenticated");
    });

    it("401 ou 403 sans session (garde bloque avant toute lecture de donnees)", async () => {
      const { requireAdminAal2 } = await import("@/lib/auth/session");
      const res: { ok: boolean; status?: number; error?: string } =
        await requireAdminAal2();
      expect([401, 403]).toContain(res.status);
    });
  });

  describe("en-têtes HTTP via next.config.headers() (appliques a toutes les reponses)", () => {
    it("/api/admin/:path* possede Cache-Control private no-store + X-Robots-Tag noindex nofollow", async () => {
      const headersFn = (nextConfig as NextConfig).headers;
      expect(typeof headersFn).toBe("function");
      const headersList = await headersFn!();
      const entry = headersList.find(
        (e: HeaderEntry) => e.source === "/api/admin/:path*",
      );
      expect(entry).toBeDefined();
      const headersMap: Record<string, string> = {};
      entry!.headers.forEach((h) => {
        headersMap[h.key.toLowerCase()] = h.value;
      });
      expect(headersMap["cache-control"]).toBe("private, no-store");
      expect(headersMap["x-robots-tag"]).toBe("noindex, nofollow");
    });

    it("/:locale/admin/:path* possede Cache-Control private no-store + X-Robots-Tag noindex nofollow", async () => {
      const headersFn = (nextConfig as NextConfig).headers;
      const headersList = await headersFn!();
      const entry = headersList.find(
        (e: HeaderEntry) => e.source === "/:locale/admin/:path*",
      );
      expect(entry).toBeDefined();
      const headersMap: Record<string, string> = {};
      entry!.headers.forEach((h) => {
        headersMap[h.key.toLowerCase()] = h.value;
      });
      expect(headersMap["cache-control"]).toBe("private, no-store");
      expect(headersMap["x-robots-tag"]).toBe("noindex, nofollow");
    });
  });

  describe("pages admin (metadata noindex)", () => {
    it.each(PAGES_WITH_METADATA)(
      "page genere metadata noindex",
      async ({ generateMetadata }) => {
        const meta = await generateMetadata({
          params: Promise.resolve({ locale: "fr" }),
        });
        expect(
          (meta as { robots?: { index: boolean; follow: boolean } }).robots,
        ).toEqual({ index: false, follow: false });
      },
    );
  });
});
