import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  isAdmin: boolean;
  hasMfa: boolean;
  /** Session réellement portée à aal2 (défi TOTP vérifié — pas seulement un
   * facteur vérifié existant). Exigence M7a : toute action de confirmation
   * de paiement exige une session aal2. */
  aal2: boolean;
};

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

  return { userId: user.id, isAdmin, hasMfa, aal2 };
}

export type AdminGuardResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; status: 401 | 403; error: "unauthenticated" | "not_admin" | "mfa_required" };

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
  return { ok: true, auth };
}
