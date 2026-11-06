import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M8 (bloc 3a) — page « Mes commandes et mes PDF » (/fr/account) :
 *  - SANS session ⇒ carte neutre : aucun formulaire e-mail, aucune donnée
 *    de commande, AUCUNE lecture base ;
 *  - AVEC session ⇒ statuts affichés EXACTEMENT (mêmes vocables que la
 *    page de suivi), reçu UNIQUEMENT sur commande confirmée ;
 *  - droits de téléchargement : un droit valide ouvre un lien
 *    /api/downloads/{entitlementId}?file=… ; un droit révoqué ou expiré
 *    n'ouvre AUCUN lien et affiche le texte « non actif » — il est filtré
 *    AVANT tout appel de résolution (aucune requête pour un droit mort) ;
 *  - état vide clair ; page jamais indexée.
 */

const fake = vi.hoisted(() => ({
  auth: null as { userId: string; isAdmin: boolean; hasMfa: boolean; aal2: boolean } | null,
  orders: [] as unknown[],
  grants: {} as Record<string, { ok: boolean; grant?: { files: Array<{ id: string; storagePath: string; label: string }> } }>,
  grantCalls: [] as string[],
  dbCalls: 0,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (arg: string | { namespace: string }) => {
    const ns = typeof arg === "string" ? arg : arg.namespace;
    return (key: string) => `t:${ns}:${key}`;
  },
  setRequestLocale: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: async () => fake.auth,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    fake.dbCalls += 1;
    return {
      from: (table: string) => {
        if (table !== "orders") throw new Error(`table inattendue: ${table}`);
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.order = () => Promise.resolve({ data: fake.orders, error: null });
        return chain;
      },
    };
  },
}));

vi.mock("@/lib/files/entitlements", () => ({
  resolveDownloadGrant: async (input: { userId: string | null; entitlementId: string }) => {
    fake.grantCalls.push(input.entitlementId);
    return fake.grants[input.entitlementId] ?? { ok: false };
  },
}));

type PageModule = typeof import("@/app/[locale]/(public)/account/page");
const page = (await import("@/app/[locale]/(public)/account/page")) as PageModule;

type Element = { type?: unknown; props?: { children?: unknown; [k: string]: unknown } };

/** Parcours de l'arbre RSC (composants clients JAMAIS exécutés : lus comme types). */
function findElements(node: unknown, type: unknown, out: Element[] = []): Element[] {
  if (node === null || typeof node !== "object") return out;
  const el = node as Element;
  if (el.type === type) out.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) findElements(child, type, out);
  } else {
    findElements(children, type, out);
  }
  return out;
}

const params = Promise.resolve({ locale: "fr" }) as Promise<{ locale: string }>;

const SESSION = { userId: "11111111-1111-4111-8111-111111111111", isAdmin: false, hasMfa: false, aal2: false };

function order(overrides: Partial<Record<string, unknown>> & { id: string; reference: string; status: string }) {
  return {
    offer_name: "Coaching Perte de poids",
    total_da: 3800,
    created_at: "2026-11-01T10:00:00Z",
    entitlements: null,
    ...overrides,
  };
}

beforeEach(() => {
  fake.auth = null;
  fake.orders = [];
  fake.grants = {};
  fake.grantCalls = [];
  fake.dbCalls = 0;
});

describe("page /fr/account — accès minimal M8", () => {
  it("TEST NOMMÉ : sans session ⇒ carte neutre (aucun formulaire e-mail, aucune donnée, AUCUNE lecture base)", async () => {
    fake.auth = null;
    const el = await page.default({ params });
    const json = JSON.stringify(el);

    expect(json).toContain("t:account:signedOutTitle");
    expect(json).toContain("t:account:signedOutText");
    // Aucun champ ni formulaire (jamais de saisie d'e-mail sur cette page).
    expect(findElements(el, "form")).toHaveLength(0);
    expect(findElements(el, "input")).toHaveLength(0);
    // Aucune donnée de commande ni lien de téléchargement exposé.
    expect(json).not.toContain("t:order.status:");
    expect(json).not.toContain("/api/downloads/");
    expect(json).not.toContain("/receipt");
    // Rien n'est lu en base sans session.
    expect(fake.dbCalls).toBe(0);
    expect(fake.grantCalls).toHaveLength(0);
  });

  it("TEST NOMMÉ : session ⇒ statuts de paiement EXACTS (pending/paid/cancelled/refunded) et reçu UNIQUEMENT sur commande confirmée", async () => {
    fake.auth = SESSION;
    fake.orders = [
      order({ id: "o1", reference: "TKF-2601-AAAA", status: "pending_payment" }),
      order({ id: "o2", reference: "TKF-2601-BBBB", status: "paid", entitlements: [] }),
      order({ id: "o3", reference: "TKF-2601-CCCC", status: "cancelled" }),
      order({ id: "o4", reference: "TKF-2601-DDDD", status: "refunded" }),
    ];
    const el = await page.default({ params });
    const json = JSON.stringify(el);

    // Statuts EXACTS (mêmes vocables que la page de suivi).
    expect(json).toContain("t:order.status:pending_payment");
    expect(json).toContain("t:order.status:paid");
    expect(json).toContain("t:order.status:cancelled");
    expect(json).toContain("t:order.status:refunded");
    for (const ref of ["TKF-2601-AAAA", "TKF-2601-BBBB", "TKF-2601-CCCC", "TKF-2601-DDDD"]) {
      expect(json).toContain(ref);
    }
    // Reçu : UNIQUEMENT sur la commande payée (route exige session + paid).
    expect(json).toContain("/api/orders/TKF-2601-BBBB/receipt");
    expect(json).not.toContain("/api/orders/TKF-2601-AAAA/receipt");
    expect(json).not.toContain("/api/orders/TKF-2601-CCCC/receipt");
    expect(json).not.toContain("/api/orders/TKF-2601-DDDD/receipt");
    // Payée sans aucun droit ⇒ état « aucun PDF » (rien de masqué).
    expect(json).toContain("t:account:noFiles");
    // Aucun lien de téléchargement sans droit.
    expect(json).not.toContain("/api/downloads/");
  });

  it("TEST NOMMÉ : droit valide ⇒ lien /api/downloads ; droits révoqué et expiré ⇒ AUCUN lien + texte non actif, sans même appel de résolution", async () => {
    fake.auth = SESSION;
    fake.orders = [
      order({
        id: "o1",
        reference: "TKF-2601-BBBB",
        status: "paid",
        entitlements: [
          { id: "ent-valid", revoked_at: null, expires_at: null },
          { id: "ent-revoked", revoked_at: "2026-11-02T10:00:00Z", expires_at: null },
          { id: "ent-expired", revoked_at: null, expires_at: "2026-01-01T10:00:00Z" },
        ],
      }),
    ];
    fake.grants = {
      "ent-valid": {
        ok: true,
        grant: { files: [{ id: "file-1", storagePath: "offers/programme.pdf", label: "Programme PDF" }] },
      },
    };
    const el = await page.default({ params });
    const json = JSON.stringify(el);

    // Droit valide ⇒ bouton de téléchargement (la route re-valide côté serveur).
    expect(json).toContain("/api/downloads/ent-valid?file=file-1");
    expect(json).toContain("t:account:filesTitle");
    // Droits révoqué/expiré ⇒ JAMAIS présenté actif.
    expect(json).not.toContain("/api/downloads/ent-revoked");
    expect(json).not.toContain("/api/downloads/ent-expired");
    expect(json).toContain("t:account:rightInactive");
    // Filtrés AVANT toute résolution : aucune requête pour un droit mort.
    expect(fake.grantCalls).toEqual(["ent-valid"]);
  });

  it("TEST NOMMÉ : état vide ⇒ message clair, aucun lien de téléchargement ni reçu", async () => {
    fake.auth = SESSION;
    fake.orders = [];
    const el = await page.default({ params });
    const json = JSON.stringify(el);

    expect(json).toContain("t:account:emptyTitle");
    expect(json).toContain("t:account:emptyText");
    expect(json).not.toContain("/api/downloads/");
    expect(json).not.toContain("/receipt");
    expect(fake.grantCalls).toHaveLength(0);
  });

  it("TEST NOMMÉ : metadata jamais indexée (robots noindex, titre personnel)", async () => {
    const meta = await page.generateMetadata({ params });
    expect(meta.title).toBe("t:account:metaTitle");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
