import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";

/**
 * M9a (c) — REVUE D'IDENTITÉ d'un lead `needs_review`.
 *
 * Contexte : `submit_lead` (m5_submit_lead.sql l.63-68) marque
 * `needs_review = true` et conserve le nom divergent dans `submitted_name`
 * quand un numéro déjà connu (index UNIQUE partiel sur phone_norm) resoumet
 * un nom différent — sans JAMAIS écraser le nom du lead ni ses notes.
 * Un même numéro peut être partagé dans une famille : la décision est
 * HUMAINE, aucune fusion automatique n'existe (ni ici ni ailleurs).
 *
 * Trois décisions possibles, toutes auditées avec motif (obligatoire) :
 *   - keep_existing  : garder le nom enregistré, marquer revu ;
 *   - use_submitted  : remplacer le nom par le nom soumis, marquer revu ;
 *   - note_and_close : marquer revu en notant l'autre nom dans les notes
 *     (les notes existantes ne sont JAMAIS écrasées — ajout en fin).
 *
 * L'audit (`lead_identity_reviewed`) trace l'acteur, la décision, le motif
 * et le nom soumis — JAMAIS le contenu des notes (même règle que la route
 * notes : seul le fait d'écriture est tracé).
 *
 * Garde `requireAdminAal2` en tête ; entrée zod STRICTE ; rate limit IP
 * (même filet que les autres écritures lead : 20/600 s).
 */

// Écriture lead : filet IP large (même seuil que les formulaires M9a).
const LEAD_WRITE_LIMIT = 20;
const LEAD_WRITE_WINDOW = 600;

const DECISIONS = ["keep_existing", "use_submitted", "note_and_close"] as const;

/** Entrée stricte : décision + motif, RIEN D'AUTRE. */
const inputSchema = z.strictObject({
  decision: z.enum(DECISIONS),
  reason: z.string().min(3).max(1000),
});

async function rateLimitedResponse() {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(LEAD_WRITE_WINDOW) } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireAdminAal2();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const limited = await checkRateLimit(
    ipRateLimitKey(request.headers, "leads_write_ip"),
    LEAD_WRITE_LIMIT,
    LEAD_WRITE_WINDOW,
  );
  if (!limited) return rateLimitedResponse();

  const body = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, name, submitted_name, needs_review, notes")
    .eq("id", id)
    .single();
  if (error || !lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const current = lead as {
    id: string;
    name: string;
    submitted_name: string | null;
    needs_review: boolean;
    notes: string | null;
  };
  if (!current.needs_review) {
    return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
  }

  const { decision, reason } = parsed.data;

  // use_submitted exige un nom soumis réel (jamais de remplacement à vide).
  if (decision === "use_submitted" && !current.submitted_name) {
    return NextResponse.json({ error: "no_submitted_name" }, { status: 400 });
  }

  type LeadUpdate = { needs_review: boolean; name?: string; notes?: string };
  const update: LeadUpdate = { needs_review: false };

  if (decision === "use_submitted") {
    update.name = current.submitted_name as string;
  }
  if (decision === "note_and_close") {
    // Les notes ne sont JAMAIS écrasées : ajout en fin, séparé par un
    // saut de ligne. L'autre nom = le nom soumis (le nom enregistré reste).
    const other = current.submitted_name ?? "(nom soumis non enregistré)";
    const line = `[Revue identité] autre nom soumis : ${other}`;
    update.notes = current.notes ? `${current.notes}\n${line}` : line;
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await createSupabaseAdminClient().from("audit_logs").insert({
    actor_id: guard.auth.userId,
    actor_role: "admin",
    action: "lead_identity_reviewed",
    entity_type: "lead",
    entity_id: id,
    // Motif obligatoire audité ; nom soumis tracé ; JAMAIS le contenu des notes.
    metadata: {
      lead_id: id,
      decision,
      reason,
      submitted_name: current.submitted_name,
    },
  });

  return NextResponse.json({ ok: true });
}
