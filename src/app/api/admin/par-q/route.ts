import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, userRateLimitKey } from "@/lib/security/rate-limit";

/**
 * M9a (f) — CONSULTATION EXPLICITE des réponses PAR-Q d'une commande.
 *
 * Les réponses PAR-Q (données de santé) ne sont JAMAIS lues au chargement
 * d'une page : le tableau `aptitude_questionnaires` n'est lu que par cette
 * route, après une action VOLONTAIRE de l'admin, et chaque consultation est
 * tracée dans `audit_logs` (append-only).
 *
 * Ordre IMPÉRATIF (donnée de santé) :
 *   (a) garde `requireAdminAal2` — rôle admin ET session aal2 (MFA validé
 *       sur CETTE session) ;
 *   (b) validation zod STRICTE de l'entrée : l'identifiant de commande, rien
 *       d'autre (aucun filtre, aucun champ libre, aucun ordre multiple) ;
 *   (c) rate limit (compteur Postgres `rate_limit_counters`, par admin) ;
 *   (d) ÉCRITURE DE L'AUDIT **AVANT** toute lecture des réponses ;
 *   (e) lecture des réponses UNIQUEMENT si l'audit a réussi — sinon refus
 *       5xx neutre et AUCUNE réponse lue ni renvoyée ;
 *   (f) une seule commande lue : `.eq("order_id", …)` ;
 *   (g) réponses renvoyées sans aucun détail de base (ni client, ni commande,
 *       ni texte libre). Les en-têtes `Cache-Control: private, no-store` et
 *       `X-Robots-Tag: noindex, nofollow` sont appliqués par next.config.ts
 *       (motif `/api/admin/:path*`) — ce fichier n'est pas modifié ici.
 *
 * L'entrée d'audit contient l'acteur, la commande, l'horodatage (created_at)
 * et l'action de consultation — AUCUNE réponse (jamais un q1..q7, jamais un
 * objectif, jamais un niveau).
 */

/** Filet de lecture PAR-Q par admin — configurable (ADMIN_PARQ_READ_LIMIT). */
function parqReadLimit(): number {
  const raw = process.env.ADMIN_PARQ_READ_LIMIT;
  const value = raw ? Number.parseInt(raw, 10) : 20;
  if (!Number.isFinite(value)) return 20;
  return Math.min(Math.max(value, 1), 120);
}

const PARQ_READ_WINDOW = 600;

/** Entrée stricte : l'identifiant de commande et RIEN D'AUTRE. */
const inputSchema = z.strictObject({
  orderId: z.string().uuid(),
});

/** Colonnes de réponses lues (booléens structurés — aucun texte libre). */
const ANSWER_COLUMNS = [
  "q1_heart_condition",
  "q2_exertion_chest_pain",
  "q3_rest_chest_pain",
  "q4_syncope",
  "q5_joint_bone_problem",
  "q6_heart_medication",
  "q7_other_restriction",
] as const;

export async function POST(request: Request) {
  // (a) Garde : admin + session aal2 (MFA réellement validé sur CETTE session).
  const guard = await requireAdminAal2();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // (b) Entrée stricte : l'identifiant de commande, rien d'autre.
  const body = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { orderId } = parsed.data;

  // (c) Rate limit par admin (clé hachée — jamais l'uid en clair en base).
  const limited = await checkRateLimit(
    userRateLimitKey(guard.auth.userId, "parq_read_user"),
    parqReadLimit(),
    PARQ_READ_WINDOW,
  );
  if (!limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(PARQ_READ_WINDOW) } },
    );
  }

  const admin = createSupabaseAdminClient();

  // (d) AUDIT D'ABORD : aucune réponse n'est lue avant cette écriture.
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: guard.auth.userId,
    actor_role: "admin",
    action: "parq_answers_read",
    entity_type: "order",
    entity_id: orderId,
    metadata: { order_id: orderId },
  });
  if (auditError) {
    // Échec fermé : l'audit est la condition de la lecture des réponses.
    console.error(
      JSON.stringify({
        level: "error",
        event: "parq_audit_failed",
        error: auditError.message,
      }),
    );
    return NextResponse.json({ error: "indisponible" }, { status: 500 });
  }

  // (e) Lecture des réponses — UNIQUEMENT après l'audit réussi. Le service
  // role contourne les politiques RLS : la garde (a) est donc l'unique
  // contrôle d'accès (même mécanisme que les autres routes /api/admin/*).
  const { data, error } = await admin
    .from("aptitude_questionnaires")
    .select(ANSWER_COLUMNS.join(","))
    .eq("order_id", orderId)
    .limit(1);
  if (error) {
    console.error(
      JSON.stringify({ level: "error", event: "parq_read_failed", error: error.message }),
    );
    return NextResponse.json({ error: "indisponible" }, { status: 500 });
  }

  const row = (data ?? [])[0] as Record<string, boolean> | undefined;
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // (f) Une seule commande, sept booléens — rien d'autre.
  return NextResponse.json({
    orderId,
    answers: {
      q1: row.q1_heart_condition === true,
      q2: row.q2_exertion_chest_pain === true,
      q3: row.q3_rest_chest_pain === true,
      q4: row.q4_syncope === true,
      q5: row.q5_joint_bone_problem === true,
      q6: row.q6_heart_medication === true,
      q7: row.q7_other_restriction === true,
    },
  });
}
