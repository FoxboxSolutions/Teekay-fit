import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M5 — RLS des tables de capture : ni lecture ni écriture anonyme sur
 * leads / quiz_submissions / consents ; `submit_lead` révoquée de anon.
 */

const env = getLocalEnv();
const runId = String(Date.now()).slice(-7);
const PHONE = `+2137${runId.slice(0, 8)}`;

let anon: SupabaseClient;
let service: SupabaseClient;

beforeAll(() => {
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  await service.from("leads").delete().eq("phone_norm", PHONE);
});

describe("M5 — RLS : leads", () => {
  it("anon ne lit AUCUN lead (aucune donnée fuitée)", async () => {
    // Pas de GRANT anon sur la table : permission denied 42501 (ou vide si
    // un jour on accorde SELECT avec RLS stricte). Jamais de fuite.
    const { data } = await anon.from("leads").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("anon ne crée AUCUN lead (écriture refusée)", async () => {
    const { error } = await anon.from("leads").insert({ name: "X", source: "site" });
    expect(error).not.toBeNull();
  });
});

describe("M5 — RLS : quiz_submissions", () => {
  it("anon ne lit AUCUNE soumission (aucune donnée fuitée)", async () => {
    const { data } = await anon.from("quiz_submissions").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("anon ne crée AUCUNE soumission", async () => {
    const { error } = await anon
      .from("quiz_submissions")
      .insert({ answers: { objectif: "forme" } });
    expect(error).not.toBeNull();
  });
});

describe("M5 — RLS : consents", () => {
  it("anon ne lit AUCUN consentement (aucune donnée fuitée)", async () => {
    const { data } = await anon.from("consents").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("anon ne crée AUCUN consentement", async () => {
    const { error } = await anon
      .from("consents")
      .insert({ consent_type: "recontact", version: "x" });
    expect(error).not.toBeNull();
  });
});

describe("M5 — submit_lead réservée au service role", () => {
  it("anon ne peut pas appeler submit_lead (permission refusée)", async () => {
    const { error } = await anon.rpc("submit_lead", {
      p_name: "Anon",
      p_phone: PHONE,
      p_phone_norm: PHONE,
      p_email: null,
      p_goal: null,
      p_offer_slug: null,
      p_source: "contact",
      p_answers: null,
      p_recommended_slug: null,
      p_result_token_hash: null,
      p_result_token_expires_at: null,
      p_notes: "tentative anonyme",
      p_consent_recontact_version: "v1",
      p_consent_marketing_version: null,
      p_consent_age18_version: "v1",
    });
    expect(error).not.toBeNull();

    const { data: lead } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", PHONE)
      .maybeSingle();
    expect(lead).toBeNull();
  });

  it("service role peut appeler submit_lead (parcours serveur valide)", async () => {
    const { error } = await service.rpc("submit_lead", {
      p_name: "Service",
      p_phone: PHONE,
      p_phone_norm: PHONE,
      p_email: null,
      p_goal: null,
      p_offer_slug: null,
      p_source: "contact",
      p_answers: null,
      p_recommended_slug: null,
      p_result_token_hash: null,
      p_result_token_expires_at: null,
      p_notes: "parcours serveur",
      p_consent_recontact_version: "v1",
      p_consent_marketing_version: null,
      p_consent_age18_version: "v1",
    });
    expect(error).toBeNull();

    const { data: lead } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", PHONE)
      .maybeSingle();
    expect(lead).not.toBeNull();
  });
});
