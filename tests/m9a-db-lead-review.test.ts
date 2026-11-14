import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M9a point (c) — revue d'identité `needs_review`, preuve par la pratique
 * avec des données FICTIVES et la chaîne EXISTANTE (aucun nouveau chemin
 * d'écriture de leads) :
 *
 *   1. `submit_lead` (m5_submit_lead_notes.sql, 15 params) crée un lead avec
 *      notes de coach ; une 2e soumission du MÊME numéro normalisé
 *      (phone_norm, index UNIQUE partiel m5_lead_quiz_schema l.27-29) avec un
 *      nom DIFFÉRENT ⇒ `needs_review = true` + `submitted_name` conservé,
 *      nom du lead inchangé, notes du coach PRÉSERVÉES (l.62-70) ;
 *   2. la requête EXACTE de la page « À traiter » (a-traiter/page.tsx,
 *      section revue d'identité M9a-c : `.eq("needs_review", true)`) fait
 *      apparaître le lead avec ses DEUX identités côte à côte ;
 *   3. décision « note_and_close » appliquée comme la route
 *      /api/admin/leads/[id]/review (needs_review=false + notes AUGMENTÉES,
 *      jamais écrasées) + audit `lead_identity_reviewed` avec motif ;
 *   4. après décision : le lead DISPARAÎT du compteur (la requête de la
 *      page ne le retourne plus) et les notes contiennent l'ancienne note
 *      du coach PLUS la ligne d'identité.
 */

const env = getLocalEnv();
const runId = `m9arev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let service: SupabaseClient;
let leadId = "";

const phoneDisplay = "+213 7 00 11 22 33";
// Numéro normalisé unique pour ce run (E.164 sans espaces).
const phoneNorm = `+213700${Date.now().toString().slice(-8)}`;

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

afterAll(async () => {
  if (leadId) await service.from("leads").delete().eq("id", leadId);
});

describe("M9a (c) — revue d'identité needs_review (chaîne réelle)", () => {
  it("doublon de nom créé par submit_lead ⇒ visible côté à-côté (2 identités), décision audité, notes préservées, compteur mis à jour", async () => {
    // ── 1) Chaîne existante : 1re soumission (nom A, notes coach) ──
    const first = await service.rpc("submit_lead", {
      p_name: "Famille Amrani",
      p_phone: phoneDisplay,
      p_phone_norm: phoneNorm,
      p_email: `${runId}@test.tkf`,
      p_goal: null,
      p_offer_slug: "starter",
      p_source: "contact",
      p_answers: null,
      p_recommended_slug: null,
      p_result_token_hash: null,
      p_result_token_expires_at: null,
      p_notes: "Message du formulaire de contact (coach).",
      p_consent_recontact_version: "m9a-test-v1",
      p_consent_marketing_version: null,
      p_consent_age18_version: "m9a-test-v1",
    } as never);
    expect(first.error).toBeNull();
    leadId = first.data as string;

    // ── 2) Même numéro, nom DIFFÉRENT ⇒ needs_review + submitted_name ──
    const second = await service.rpc("submit_lead", {
      p_name: "Yacine Amrani",
      p_phone: phoneDisplay,
      p_phone_norm: phoneNorm,
      p_email: `${runId}-2@test.tkf`,
      p_goal: null,
      p_offer_slug: "pack_3m",
      p_source: "quiz",
      p_answers: { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false, objective: "strength", experience_level: "beginner" },
      p_recommended_slug: "starter",
      p_result_token_hash: `tok-${runId}`,
      p_result_token_expires_at: new Date(Date.now() + 72 * 3_600_000).toISOString(),
      p_notes: null,
      p_consent_recontact_version: "m9a-test-v1",
      p_consent_marketing_version: null,
      p_consent_age18_version: "m9a-test-v1",
    } as never);
    expect(second.error).toBeNull();
    expect(second.data).toBe(leadId); // upsert par phone_norm : MÊME lead

    const { data: flagged, error: flagErr } = await service
      .from("leads")
      .select("id, name, submitted_name, needs_review, notes, offer_slug, source")
      .eq("id", leadId)
      .single();
    expect(flagErr).toBeNull();
    // Nom du lead inchangé, nom divergent conservé à côté, drapeau levé.
    expect(flagged).toMatchObject({
      name: "Famille Amrani",
      submitted_name: "Yacine Amrani",
      needs_review: true,
    });
    // Notes du coach JAMAIS écrasées par la chaîne existante.
    expect((flagged as { notes: string }).notes).toContain("Message du formulaire de contact (coach).");

    // ── 3) Requête EXACTE de la page « À traiter » (revue d'identité) ──
    const { data: reviewList, error: reviewErr } = await service
      .from("leads")
      .select("id, name, submitted_name, offer_slug, source, created_at, updated_at")
      .eq("needs_review", true)
      .order("created_at", { ascending: false });
    expect(reviewErr).toBeNull();
    const inList = (reviewList ?? []).find((l: { id: string }) => l.id === leadId);
    expect(inList).toBeTruthy(); // visible dans l'écran + compté
    expect(inList).toMatchObject({ name: "Famille Amrani", submitted_name: "Yacine Amrani" });

    // ── 4) Décision « note_and_close » : sémantique EXACTE de la route
    //      /api/admin/leads/[id]/review (needs_review=false, notes ajoutées
    //      en fin, audit avec motif) ──
    const existingNotes = (flagged as { notes: string }).notes;
    const otherName = (flagged as { submitted_name: string }).submitted_name;
    const line = `[Revue identité] autre nom soumis : ${otherName}`;
    const { error: updErr } = await service
      .from("leads")
      .update({ needs_review: false, notes: `${existingNotes}\n${line}` })
      .eq("id", leadId);
    expect(updErr).toBeNull();

    await service.from("audit_logs").insert({
      actor_id: null,
      actor_role: "admin",
      action: "lead_identity_reviewed",
      entity_type: "lead",
      entity_id: leadId,
      metadata: {
        lead_id: leadId,
        decision: "note_and_close",
        reason: "numéro familial partagé (test M9a-c)",
        submitted_name: otherName,
      },
    });

    // Audit présent (append-only), motif dans les metadata.
    const { data: audits } = await service
      .from("audit_logs")
      .select("action, entity_type, metadata")
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false });
    expect(audits?.[0]).toMatchObject({
      action: "lead_identity_reviewed",
      entity_type: "lead",
      metadata: expect.objectContaining({
        decision: "note_and_close",
        reason: "numéro familial partagé (test M9a-c)",
      }),
    });

    // ── 5) COMPTEUR MIS À JOUR : le lead a disparu de la liste de la page ──
    const { data: after } = await service
      .from("leads")
      .select("id")
      .eq("needs_review", true);
    expect((after ?? []).some((l: { id: string }) => l.id === leadId)).toBe(false);

    // ── 6) Notes préservées : ancienne note + ligne d'identité ──
    const { data: finalLead } = await service
      .from("leads")
      .select("notes")
      .eq("id", leadId)
      .single();
    const notes = (finalLead as { notes: string }).notes;
    expect(notes).toContain("Message du formulaire de contact (coach).");
    expect(notes).toContain("[Revue identité] autre nom soumis : Yacine Amrani");
    expect(notes.indexOf("Message du formulaire")).toBeLessThan(
      notes.indexOf("[Revue identité]"),
    );
  });
});
