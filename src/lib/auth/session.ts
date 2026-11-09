import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AuthContext = {
  userId: string;
  isAdmin: boolean;
  hasMfa: boolean;
  /** Session réellement portée à aal2 (défi TOTP vérifié — pas seulement un
   * facteur vérifié existant). Exigence M7a : toute action de confirmation
   * de paiement exige une session aal2. */
  aal2: boolean;
  /** Identifiant de session GoTrue (clair du JWT de la session courante,
   * payload — jamais une donnée sensible) ; null si introuvable. */
  sessionId: string | null;
};

/** Décode le payload d'un JWT (base64url, SANS vérification de signature —
 * uniquement pour lire des métadonnées neutres comme `session_id`). */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Session_id GoTrue du JWT courant (null si absent ou forme inattendue). */
export function sessionIdFromJwt(jwt: string): string | null {
  const payload = decodeJwtPayload(jwt);
  const sessionId = payload?.session_id;
  return typeof sessionId === "string" && sessionId.length >= 1 && sessionId.length <= 128
    ? sessionId
    : null;
}

/** Durée absolue d'une session admin vérifiée par MFA (M9a — ajustement) :
 * défaut 12 h, configurable (`ADMIN_SESSION_MAX_SECONDS`, borné 5 min–7 j).
 * Passé ce délai, une NOUVELLE connexion avec MFA est exigée — la relance
 * d'activité ne prolonge jamais (durée absolue, pas glissante). */
export const ADMIN_SESSION_MAX_SECONDS_DEFAULT = 43_200;
export function adminSessionMaxSeconds(): number {
  const raw = process.env.ADMIN_SESSION_MAX_SECONDS;
  if (!raw) return ADMIN_SESSION_MAX_SECONDS_DEFAULT;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return ADMIN_SESSION_MAX_SECONDS_DEFAULT;
  return Math.min(Math.max(value, 300), 604_800);
}

/**
 * Contexte d'authentification côté serveur.
 * - isAdmin : rôle relu dans user_roles via les politiques RLS (jamais depuis
 *   le client, jamais auto-attribuable).
 * - hasMfa : facteur TOTP vérifié ENREGISTRÉ (compte sécurisé).
 * - aal2 : la SESSION COURANTE porte aal2 (Authenticator Assurance Level,
 *   revalide à chaque requête — un login ancien reste aal1 tant que le défi
 *   TOTP n'a pas été passé).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  let sessionId: string | null = null;
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (typeof jwt === "string") sessionId = sessionIdFromJwt(jwt);

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const isAdmin = (roleRows ?? []).some((row) => row.role === "admin");

  let hasMfa = false;
  let aal2 = false;
  if (isAdmin) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    hasMfa = (factors?.all ?? []).some(
      (factor) => factor.factor_type === "totp" && factor.status === "verified",
    );
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal2 = assurance?.currentLevel === "aal2";
  }

  return { userId: user.id, isAdmin, hasMfa, aal2, sessionId };
}

export type AdminGuardResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; status: 401 | 403; error: "unauthenticated" | "not_admin" | "mfa_required" | "session_expired" };

/** Enregistre la DERNIÈRE vérification MFA réussie (utilisateur, session) —
 * appelé par les routes de défi TOTP / codes de secours après succès. La
 * table est écrite en service-role uniquement (aucune politique RLS). */
export async function recordAdminMfaSession(userId: string, sessionId: string | null): Promise<void> {
  if (!sessionId) return; // session introuvable : rien à borner (échec fermé à la garde)
  await createSupabaseAdminClient()
    .from("admin_mfa_sessions")
    .upsert(
      { user_id: userId, session_id: sessionId, mfa_verified_at: new Date().toISOString() },
      { onConflict: "user_id,session_id" },
    );
}

/**
 * Fenêtre absolue : l'enregistrement a-t-il plus de `maxSeconds` ? défaut
 * true (échec fermé) si la ligne est absente, inconnue ou trop ancienne.
 */
export async function adminMfaSessionExpired(
  userId: string,
  sessionId: string | null,
): Promise<boolean> {
  if (!sessionId) return true;
  const { data } = await createSupabaseAdminClient()
    .from("admin_mfa_sessions")
    .select("mfa_verified_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .maybeSingle();
  const verifiedAt = (data as { mfa_verified_at?: string } | null)?.mfa_verified_at;
  if (!verifiedAt) return true;
  const ageSeconds = (Date.now() - new Date(verifiedAt).getTime()) / 1000;
  return ageSeconds >= adminSessionMaxSeconds();
}

/**
 * Garde admin pour les routes /api/admin/*.
 * - requireMfa (défaut true) : facteur TOTP vérifié exigé — authentification
 *   forte admin (PRD §16). false uniquement pour les routes d'activation MFA.
 */
export async function requireAdmin(options?: { requireMfa?: boolean }): Promise<AdminGuardResult> {
  const requireMfa = options?.requireMfa ?? true;
  const auth = await getAuthContext();
  if (!auth) return { ok: false, status: 401, error: "unauthenticated" };
  if (!auth.isAdmin) return { ok: false, status: 403, error: "not_admin" };
  if (requireMfa && !auth.hasMfa) return { ok: false, status: 403, error: "mfa_required" };
  return { ok: true, auth };
}

/**
 * Garde strict M7a pour toute action de CONFIRMATION (paiements, paramètres) :
 * admin ET session courante vérifiée par TOTP (aal2). Un facteur vérifié en
 *registré ne suffit pas — la session elle-même doit porter aal2, sinon un
 * accès négligé (cookie volé, machine partagée) pourrait confirmer un
 * paiement. Utilisé par /admin/payments (bloc 4) ; exigence : « aucune action
 * de confirmation accessible sans aal2 ».
 */
export async function requireAdminAal2(): Promise<AdminGuardResult> {
  const auth = await getAuthContext();
  if (!auth) return { ok: false, status: 401, error: "unauthenticated" };
  if (!auth.isAdmin) return { ok: false, status: 403, error: "not_admin" };
  if (!auth.aal2) return { ok: false, status: 403, error: "mfa_required" };
  // Durée ABSOLUE (M9a — ajustement) : la vérification MFA de CETTE session
  // date de plus de la durée bornée (défaut 12 h) ⇒ pas d'accès admin, il
  // faut se reconnecter et repasser le défi TOTP. Jamais prolongée par la
  // relance d'activité — vérifiée à CHAQUE requête admin.
  if (await adminMfaSessionExpired(auth.userId, auth.sessionId)) {
    return { ok: false, status: 403, error: "session_expired" };
  }
  return { ok: true, auth };
}
