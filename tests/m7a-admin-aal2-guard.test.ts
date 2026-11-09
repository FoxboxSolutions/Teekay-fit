import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M7a bloc 3 — garde serveur strict aal2 (`requireAdminAal2`) :
 *  - sans session ⇒ 401 unauthenticated ;
 *  - connecté non admin ⇒ 403 not_admin ;
 *  - admin avec facteur vérifié ENREGISTRÉ mais session encore aal1 ⇒ 403
 *    (le cas critique : un facteur existant ne suffit pas, la SESSION doit
 *    porter aal2, sinon un cookie volé pourrait confirmer un paiement) ;
 *  - admin avec session aal2 (défi TOTP passé) ⇒ OK ;
 * Le pendant SQL (is_admin_aal2) est prouvé par tests/m7a-db-site-settings,
 * et le flux réel TOTP (enrôlement → défi → aal2) par tests/m7a-flow-e2e
 * (bloc 8). La session Supabase est simulée ici (client serveur mocké) :
 * l'objet testé est le GARDE, pas GoTrue.
 */
const fake = vi.hoisted(() => ({
  user: null as null | { id: string },
  roles: [] as string[],
  totpFactors: [] as { factor_type: string; status: string }[],
  assuranceLevel: "aal1" as string | null,
  sessionJwt: "x.y.z" as string, // JWT simulé (payload base64url)
  /** Lignes admin_mfa_sessions : ["<session_id>", verifiedAt ISO] */
  mfaSessions: [] as { user_id: string; session_id: string; mfa_verified_at: string }[],
}));

// Payload JWT réaliste (session_id GoTrue) encodé base64url.
function payloadJwt(sessionId: string | null): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: "u-1", ...(sessionId ? { session_id: sessionId } : {}) }),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `x.${payload}.z`;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: fake.user }, error: null }),
      getSession: async () => ({ data: { session: { access_token: fake.sessionJwt } } }),
      mfa: {
        listFactors: async () => ({ data: { all: fake.totpFactors }, error: null }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: fake.assuranceLevel, nextLevel: "aal2" },
          error: null,
        }),
      },
    },
    from: (table: string) => {
      if (table !== "user_roles") throw new Error(`table inattendue: ${table}`);
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        then: (
          onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        ) => Promise.resolve({ data: fake.roles.map((role) => ({ role })), error: null }).then(onFulfilled),
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    // admin_mfa_sessions : unique lookup (select*.eq*.eq.maybeSingle).
    from: (table: string) => {
      if (table !== "admin_mfa_sessions") throw new Error(`table inattendue: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({ data: fake.mfaSessions[0] ?? null, error: null });
      chain.upsert = () => Promise.resolve({ data: null, error: null });
      return chain;
    },
  }),
}));

type Module = typeof import("@/lib/auth/session");

let requireAdminAal2: Module["requireAdminAal2"];
let requireAdmin: Module["requireAdmin"];
let getAuthContext: Module["getAuthContext"];

beforeEach(async () => {
  ({ requireAdminAal2, requireAdmin, getAuthContext } = await import("@/lib/auth/session"));
  fake.user = null;
  fake.roles = [];
  fake.totpFactors = [];
  fake.assuranceLevel = "aal1";
  fake.sessionJwt = payloadJwt(null);
  fake.mfaSessions = [];
});

describe("getAuthContext — aal2 lu depuis le niveau d'assurance courant", () => {
  it("admin avec facteur vérifié mais session aal1 ⇒ aal2:false (facteur existant ne suffit pas)", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    const auth = await getAuthContext();
    expect(auth?.isAdmin).toBe(true);
    expect(auth?.hasMfa).toBe(true);
    expect(auth?.aal2).toBe(false);
  });

  it("admin avec défi passé (assurance aal2) ⇒ aal2:true", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    fake.assuranceLevel = "aal2";
    const auth = await getAuthContext();
    expect(auth?.aal2).toBe(true);
  });
});

describe("requireAdminAal2 — aucune confirmation sans second facteur TOTP", () => {
  it("sans session ⇒ 401 unauthenticated", async () => {
    const r = await requireAdminAal2();
    expect(r).toEqual({ ok: false, status: 401, error: "unauthenticated" });
  });

  it("connecté mais non admin ⇒ 403 not_admin (jamais d'accès par simple login)", async () => {
    fake.user = { id: "u-2" };
    const r = await requireAdminAal2();
    expect(r).toEqual({ ok: false, status: 403, error: "not_admin" });
  });

  it("admin avec facteur vérifié EXISTANT mais session aal1 ⇒ 403 — test nommé : sans aal2, l'action est refusée", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    fake.assuranceLevel = "aal1"; // session sans défi
    const r = await requireAdminAal2();
    expect(r).toEqual({ ok: false, status: 403, error: "mfa_required" });
  });

  it("admin sans aal2 et sans facteur ⇒ 403", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    const r = await requireAdminAal2();
    expect(r).toEqual({ ok: false, status: 403, error: "mfa_required" });
  });

  it("admin avec session aal2 (défi TOTP passé) ⇒ OK, contexte fourni", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    fake.assuranceLevel = "aal2";
    fake.sessionJwt = payloadJwt("sess-1");
    // Enregistrement MFA FRAIS (il y a 5 min) pour cette session.
    fake.mfaSessions = [
      {
        user_id: "u-1",
        session_id: "sess-1",
        mfa_verified_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    ];
    const r = await requireAdminAal2();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.auth.userId).toBe("u-1");
      expect(r.auth.aal2).toBe(true);
      expect(r.auth.sessionId).toBe("sess-1");
    }
  });

  it("aucun enregistrement MFA pour cette session ⇒ session_expired (échec fermé)", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    fake.assuranceLevel = "aal2";
    fake.sessionJwt = payloadJwt("sess-1");
    fake.mfaSessions = [];
    const r = await requireAdminAal2();
    expect(r).toEqual({ ok: false, status: 403, error: "session_expired" });
  });

  it("VIEILLE session aal2 (défi TOTP > durée absolue) ⇒ session_expired — nouvelle connexion avec MFA exigée", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    fake.assuranceLevel = "aal2";
    fake.sessionJwt = payloadJwt("sess-1");
    fake.mfaSessions = [
      {
        user_id: "u-1",
        session_id: "sess-1",
        mfa_verified_at: new Date(Date.now() - 43_201_000).toISOString(), // > 12 h
      },
    ];
    const r = await requireAdminAal2();
    expect(r).toEqual({ ok: false, status: 403, error: "session_expired" });
  });

  it("VIEILLE session aal2 revalide DANS la durée absolue (10 h) ⇒ OK", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    fake.assuranceLevel = "aal2";
    fake.sessionJwt = payloadJwt("sess-1");
    fake.mfaSessions = [
      {
        user_id: "u-1",
        session_id: "sess-1",
        mfa_verified_at: new Date(Date.now() - 10 * 3_600_000).toISOString(),
      },
    ];
    const r = await requireAdminAal2();
    expect(r.ok).toBe(true);
  });

  it("le garde existant requireAdmin garde sa sémantique M2 (facteur vérifié suffit pour l'activation)", async () => {
    fake.user = { id: "u-1" };
    fake.roles = ["admin"];
    fake.totpFactors = [{ factor_type: "totp", status: "verified" }];
    fake.assuranceLevel = "aal1";
    const r = await requireAdmin();
    expect(r.ok).toBe(true); // M2 : activation MFA, pas une confirmation de paiement
    const r2 = await requireAdminAal2();
    expect(r2.ok).toBe(false); // M7a : confirmation exige aal2
  });
});
