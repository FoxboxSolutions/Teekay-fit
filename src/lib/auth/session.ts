import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  isAdmin: boolean;
  hasMfa: boolean;
};

/**
 * Contexte d'authentification côté serveur.
 * - isAdmin : rôle relu dans user_roles via les politiques RLS (jamais depuis
 *   le client, jamais auto-attribuable).
 * - hasMfa : facteur TOTP vérifié (authentification forte admin, PRD §16).
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
  if (isAdmin) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    hasMfa = (factors?.all ?? []).some(
      (factor) => factor.factor_type === "totp" && factor.status === "verified",
    );
  }

  return { userId: user.id, isAdmin, hasMfa };
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
