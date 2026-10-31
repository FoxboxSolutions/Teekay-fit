import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M5 — fonction `submit_lead` (transaction, doublons, concurrence).
 * Écriture via le service role uniquement (les routes serveur font de même).
 */

const env = getLocalEnv();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runId = String(Date.now()).slice(-7);

/** Numéro mobile DZ valide : +213 + 9 chiffres commençant par 5. */
function dzPhone(marker: string): string {
  return `+2135${marker}${runId}`;
}

const PHONES = {
  transaction: dzPhone("1"),
  doublon: dzPhone("2"),
  concurrence: dzPhone("3"),
  consentements: dzPhone("4"),
  notes: dzPhone("5"),
};

let service: SupabaseClient;

interface SubmitParams {
  p_name: string;
  p_phone: string;
  p_phone_norm: string;
  p_email: string | null;
  p_goal: string | null;
  p_offer_slug: string | null;
  p_source: string;
  p_answers: unknown;
  p_recommended_slug: string | null;
  p_result_token_hash: string | null;
  p_result_token_expires_at: string | null;
  p_notes: string | null;
  p_consent_recontact_version: string | null;
  p_consent_marketing_version: string | null;
  p_consent_age18_version: string | null;
}

let hashCounter = 0;
function params(phone: string, overrides: Partial<SubmitParams> = {}): SubmitParams {
  hashCounter += 1;
  return {
    p_name: "Test M5",
    p_phone: phone,
    p_phone_norm: phone,
    p_email: null,
    p_goal: "performance",
    p_offer_slug: "online",
    p_source: "quiz",
    p_answers: { objectif: "performance", niveau: "debutant" },
    p_recommended_slug: "online",
    p_result_token_hash: `testhash-${suffix}-${hashCounter}`,
    p_result_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    p_notes: null,
    p_consent_recontact_version: "test-v1",
    p_consent_marketing_version: null,
    p_consent_age18_version: "test-v1",
    ...overrides,
  };
}

beforeAll(() => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  const phones = Object.values(PHONES);
  const { data: leads } = await service.from("leads").select("id").in("phone_norm", phones);
  const ids = (leads ?? []).map((l) => l.id);
  if (ids.length > 0) {
    await service.from("quiz_submissions").delete().in("lead_id", ids);
    await service.from("leads").delete().in("id", ids);
  }
});

describe("submit_lead — transaction (ajout #1)", () => {
  it("échec au milieu ⇒ ni lead sans consentement, ni consentement orphelin", async () => {
    // Réponses invalides (tableau au lieu d'objet) : l'insertion de la
    // soumission échoue APRÈS celle du lead → annulation de tout.
    const { error } = await service.rpc(
      "submit_lead",
      params(PHONES.transaction, { p_answers: [1, 2] }),
    );
    expect(error).not.toBeNull();

    const { data: lead } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", PHONES.transaction)
      .maybeSingle();
    expect(lead).toBeNull();

    // Aucun consentement orphelin créé par l'appel annulé.
    const { data: consents } = await service
      .from("consents")
      .select("id, lead_id")
      .eq("consent_type", "recontact");
    const orphans = (consents ?? []).filter((c) => c.lead_id === null);
    expect(orphans).toHaveLength(0);
  });
});

describe("submit_lead — doublons (ajout #2)", () => {
  it("même numéro ⇒ un seul lead, ancien nom conservé, needs_review si nom différent", async () => {
    const first = await service.rpc("submit_lead", params(PHONES.doublon, { p_name: "Alice" }));
    expect(first.error).toBeNull();
    const second = await service.rpc(
      "submit_lead",
      params(PHONES.doublon, { p_name: "Bob", p_goal: "forme" }),
    );
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const { data: leads } = await service
      .from("leads")
      .select("name, submitted_name, needs_review, goal")
      .eq("phone_norm", PHONES.doublon);
    expect(leads).toHaveLength(1);
    expect(leads?.[0]?.name).toBe("Alice"); // ancien nom jamais écrasé
    expect(leads?.[0]?.submitted_name).toBe("Bob");
    expect(leads?.[0]?.needs_review).toBe(true);

    const { data: subs } = await service
      .from("quiz_submissions")
      .select("id")
      .eq("lead_id", first.data as string);
    expect(subs).toHaveLength(2); // une par soumission
  });

  it("concurrence : deux soumissions simultanées ⇒ un seul lead", async () => {
    const [a, b] = await Promise.all([
      service.rpc("submit_lead", params(PHONES.concurrence, { p_name: "Conc A" })),
      service.rpc("submit_lead", params(PHONES.concurrence, { p_name: "Conc B" })),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data).toBe(b.data); // même lead (upsert)

    const { data: leads } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", PHONES.concurrence);
    expect(leads).toHaveLength(1);
  });
});

describe("submit_lead — consentements et notes", () => {
  it("recontact + 18 ans toujours, marketing seulement si version fournie", async () => {
    const { error } = await service.rpc(
      "submit_lead",
      params(PHONES.consentements, { p_consent_marketing_version: "test-v1" }),
    );
    expect(error).toBeNull();

    const { data: lead } = await service
      .from("leads")
      .select("id")
      .eq("phone_norm", PHONES.consentements)
      .single();
    const { data: consents } = await service
      .from("consents")
      .select("consent_type, version")
      .eq("lead_id", lead!.id);
    const types = (consents ?? []).map((c) => c.consent_type).sort();
    expect(types).toEqual(["age_18", "marketing", "recontact"]);
  });

  it("notes contact : ajoutées, jamais écrasées", async () => {
    const base = {
      p_source: "contact",
      p_answers: null,
      p_result_token_hash: null,
      p_result_token_expires_at: null,
      p_goal: null,
      p_offer_slug: null,
      p_recommended_slug: null,
    };
    await service.rpc(
      "submit_lead",
      params(PHONES.notes, { ...base, p_notes: "Premier message." }),
    );
    await service.rpc(
      "submit_lead",
      params(PHONES.notes, { ...base, p_notes: "Second message." }),
    );

    const { data: lead } = await service
      .from("leads")
      .select("notes")
      .eq("phone_norm", PHONES.notes)
      .single();
    expect(lead!.notes).toContain("Premier message.");
    expect(lead!.notes).toContain("Second message.");
  });
});
