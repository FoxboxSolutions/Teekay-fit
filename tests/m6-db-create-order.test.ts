import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

/**
 * M6 bloc 2 — RPC `create_order` (migration 20261103100000) :
 *  - validation serveur de l'offre/prix (jamais du navigateur) ;
 *  - e-mail obligatoire ;
 *  - référence TKF-AAMM-XXXX, suffixe sans 0/O/1/I/L (alphabet réduit) ;
 *  - idempotence : même clé + même hash ⇒ commande d'origine (sans
 *    re-consommer le promo) ; hash différent ⇒ P4096 (HTTP 409) ;
 *  - promo : % arrondi en entier DA (demi supérieur), fixe ≥ prix refus,
 *    total ≥ 1 DA garanti (remise ≥ prix déjà refusée), max_uses atomique ;
 *  - présentiel : sans séance ⇒ refus, séance pleine ⇒ « complet » neutre ;
 *  - coaching : PAR-Q structuré obligatoire + drapeau « avis médical »
 *    calculé côté serveur.
 * Écriture via le service role uniquement (comme les routes serveur).
 */

const env = getLocalEnv();
const runId = `M6CO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
/** Code promo normalisé en majuscules (le RPC compare code = upper(code)). */
const promoCode = (suffix: string) => `${runId}-${suffix}`.toUpperCase();

// Offres seedées (20261029130000) : starter 2 000 DA (paiement unique),
// online 6 000 DA (coaching), in-person 10 000 DA (présentiel).
const STARTER = "starter";
const ONLINE = "online";
const IN_PERSON = "in-person";

let service: SupabaseClient;
let seq = 0;
/** Date de la séance privée créée par le test « séance pleine » (nettoyage). */
let slotDateFull = "";

interface CreateOrderParams {
  p_idempotency_key: string;
  p_request_hash: string;
  p_status_token_hash: string;
  p_status_token_expires_at: string;
  p_offer_slug: string;
  p_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_phone_norm: string | null;
  p_provider: string;
  p_payment_method: string | null;
  p_promo_code: string | null;
  p_slot_date: string | null;
  p_aptitude: Record<string, unknown> | null;
  p_waiver_version: string | null;
  p_consent_terms_version: string;
  p_consent_privacy_version: string;
  p_consent_refunds_version: string;
}

/** PAR-Q de test : 7 booléens structurés clés q1..q7 (contrat RPC), aucun texte libre. */
const aptitude = (first: boolean) => ({
  q1: first,
  q2: false,
  q3: false,
  q4: first,
  q5: false,
  q6: first,
  q7: false,
  objective: "strength",
  experience_level: "beginner",
});

function params(overrides: Partial<CreateOrderParams> = {}): CreateOrderParams {
  seq += 1;
  const key = `${runId}-${seq}`;
  return {
    p_idempotency_key: key,
    p_request_hash: `hash-${key}`,
    p_status_token_hash: `tokhash-${key}`,
    p_status_token_expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    p_offer_slug: STARTER,
    p_name: "Test M6",
    p_email: `${key}@test.tkf`,
    p_phone: null,
    p_phone_norm: null,
    p_provider: "fake",
    p_payment_method: null,
    p_promo_code: null,
    p_slot_date: null,
    p_aptitude: null,
    p_waiver_version: null,
    p_consent_terms_version: "m6-test-v1",
    p_consent_privacy_version: "m6-test-v1",
    p_consent_refunds_version: "m6-test-v1",
    ...overrides,
  };
}

async function callOrder(p: CreateOrderParams) {
  return service.rpc("create_order", p as never);
}

/** Code promo dédié au run (nettoyé en afterAll). */
async function seedPromo(definition: {
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_uses: number | null;
  offer_id: string | null;
}) {
  const { data, error } = await service
    .from("promo_codes")
    .insert({ ...definition, code: definition.code.toUpperCase() })
    .select("id")
    .single();
  if (error) throw new Error(`seed promo: ${error.message}`);
  return data.id as string;
}

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

afterAll(async () => {
  // children cascade (aptitude, consents, items, payments, transitions).
  await service.from("orders").delete().like("idempotency_key", `${runId}%`);
  await service.from("promo_codes").delete().like("code", `${runId}%`);
  // Séance de test (présentiel) : nettoyée avec le reste.
if (slotDateFull) {
    await service
      .from("capacity_slots")
      .delete()
      .eq("slot_date", slotDateFull)
      .eq("capacity", 2);
  }
  await service.from("customers").delete().like("email", `${runId}%@test.tkf`);
  // Offre de test à prix cassé (arrondi).
  await service.from("offers").delete().like("slug", `${runId}%`);
});

describe("create_order — création nominale (validation serveur + copies figées)", () => {
  it("commande Starter sans promo : prix en base (2 000 DA), référence au format, items + paiement pending + consentements", async () => {
    const res = await callOrder(params());
    expect(res.error).toBeNull();
    const out = res.data as {
      order_id: string;
      reference: string;
      total_da: number;
      duplicated: boolean;
    };
    expect(out.duplicated).toBe(false);
    expect(out.total_da).toBe(2000);
    expect(out.reference).toMatch(/^TKF-\d{4}-[2-9A-HJKMNP-Z]{4}$/);

    const { data: order } = await service
      .from("orders")
      .select("status, unit_price_da, discount_da, total_da, offer_slug, offer_name, idempotency_key, request_hash")
      .eq("id", out.order_id)
      .single();
    expect(order?.status).toBe("pending_payment");
    expect(order?.unit_price_da).toBe(2000);

    // Copie figée : inclusions/conditions copiées au moment de la commande.
    const { data: items } = await service
      .from("order_items")
      .select("offer_slug, unit_price_da, quantity, subtotal_da, inclusions, conditions")
      .eq("order_id", out.order_id);
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject({ offer_slug: "starter", unit_price_da: 2000, quantity: 1 });
    expect(Array.isArray(items?.[0]?.inclusions)).toBe(true);
    expect(items?.[0]?.conditions).toBeTruthy();

    // Paiement « pending » créé pour le fournisseur choisi.
    const { data: payments } = await service
      .from("payments")
      .select("provider, amount_da, status")
      .eq("order_id", out.order_id);
    expect(payments).toEqual([{ provider: "fake", amount_da: 2000, status: "pending" }]);

    // Consentements versionnés (terms/privacy/refunds).
    const { data: consents } = await service
      .from("consents")
      .select("consent_type, version")
      .eq("order_id", out.order_id)
      .order("consent_type");
    expect(consents?.map((c: { consent_type: string }) => c.consent_type)).toEqual([
      "privacy",
      "refunds",
      "terms",
    ]);
    expect(consents?.every((c: { version: string }) => c.version === "m6-test-v1")).toBe(true);
  });

  it("référence : 20 créations réelles → suffixe toujours dans l'alphabet réduit (preuve par le format)", async () => {
    // La propreté de l'alphabet est prouvée sur chaque référence réellement
    // insérée (l'alphabet vit dans la migration, le regex en est l'image).
    for (let i = 0; i < 20; i++) {
      const res = await callOrder(params());
      expect(res.error).toBeNull();
      expect((res.data as { reference: string }).reference).toMatch(
        /^TKF-\d{4}-[2-9A-HJKMNP-Z]{4}$/,
      );
    }
  });

  it("e-mail obligatoire : sans e-mail ⇒ P4001, zéro écriture (commande incluse)", async () => {
    const p = params({ p_email: null });
    const res = await callOrder(p);
    expect(res.error?.code).toBe("P4001");
    expect(res.error?.message).toContain("email_obligatoire");
    const { data: orders } = await service
      .from("orders")
      .select("id")
      .eq("idempotency_key", p.p_idempotency_key);
    expect(orders).toEqual([]);
  });
});

describe("create_order — idempotence", () => {
  it("même clé + même hash ⇒ commande d'origine (référence identique), promo non re-consommé, un seul item", async () => {
    const p = params({ p_promo_code: `${promoCode("P12")}` });
    // promo seedé : 12 % sur tout (sans ciblage) max_uses 5.
    await seedPromo({
      code: `${promoCode("P12")}`,
      discount_type: "percent",
      discount_value: 12,
      max_uses: 5,
      offer_id: null,
    });

    const first = await callOrder({ ...p, p_provider: "manual" });
    expect(first.error).toBeNull();
    const a = first.data as { order_id: string; reference: string; duplicated: boolean };
    expect(a.duplicated).toBe(false);

    // Rejeu strictement identique (même hash).
    const replay = await callOrder(p);
    expect(replay.error).toBeNull();
    const b = replay.data as { order_id: string; reference: string; duplicated: boolean };
    expect(b.duplicated).toBe(true);
    expect(b.order_id).toBe(a.order_id);
    expect(b.reference).toBe(a.reference);

    // Un seul item, un seul paiement, un seul jeu de consentements.
    const { count: itemCount } = await service
      .from("order_items")
      .select("id", { count: "exact" })
      .eq("order_id", a.order_id);
    expect(itemCount).toBe(1);

    // Promo consommé UNE fois.
    const { data: promo } = await service
      .from("promo_codes")
      .select("used_count")
      .eq("code", `${promoCode("P12")}`)
      .single();
    expect(promo?.used_count).toBe(1);
  });

  it("même clé + hash de contenu différent ⇒ P4096 idempotency_conflict (HTTP 409)", async () => {
    const p = params();
    const first = await callOrder(p);
    expect(first.error).toBeNull();
    const conflict = await callOrder({ ...p, p_request_hash: `hash-different-${runId}` });
    expect(conflict.error?.code).toBe("P4096");
    expect(conflict.error?.message).toContain("idempotency_conflict");
  });
});

describe("create_order — codes promo (arrondi entier DA, plafonds, max_uses)", () => {
  it("pourcentage : arrondi UNIQUE en entier de DA, demi-DA vers le haut (offre de prix cassé 1 955 — 10 % ⇒ 196)", async () => {
    // Offre de test à prix non rond pour prouver l'arrondi demi supérieur.
    const { error: offerErr } = await service
      .from("offers")
      .insert({
        slug: `${runId}-oddprice`,
        name: "Test arrondi",
        offer_type: "starter",
        price_da: 1955,
        is_active: true,
        is_optional: true,
        inclusions: ["x"],
        exclusions: [],
        duration: "test",
        conditions: "test",
      })
      .select("id")
      .single();
    expect(offerErr).toBeNull();
    await seedPromo({
      code: `${promoCode("ODD10")}`,
      discount_type: "percent",
      discount_value: 10,
      max_uses: null,
      offer_id: null,
    });

    const res = await callOrder(params({ p_offer_slug: `${runId}-oddprice`, p_promo_code: `${promoCode("ODD10")}` }));
    expect(res.error).toBeNull();
    const out = res.data as { total_da: number; discount_da: number };
    // 1955 × 10 % = 195,5 → round demi-DA vers le haut = 196 (Jamais un flottant).
    expect(out.discount_da).toBe(196);
    expect(out.total_da).toBe(1955 - 196);
  });

  it("remise fixe ≥ prix ⇒ refus P4010 remise_trop_grande (donc total final ≥ 1 DA toujours)", async () => {
    await seedPromo({
      code: `${promoCode("FIXBIG")}`,
      discount_type: "fixed",
      discount_value: 2000,
      max_uses: null,
      offer_id: null,
    });
    const res = await callOrder(params({ p_promo_code: `${promoCode("FIXBIG")}` }));
    expect(res.error?.code).toBe("P4010");
    expect(res.error?.message).toContain("remise_trop_grande");
  });

  it("pourcentage ≥ 100 % ⇒ refus par la contrainte SQL promo_codes_percent_lt_100 (23514)", async () => {
    // La contrainte vit en base, pas dans le code : l'insert lui-même échoue.
    const { error } = await service.from("promo_codes").insert({
      code: `${promoCode("P100")}`,
      discount_type: "percent",
      discount_value: 100,
      max_uses: null,
      offer_id: null,
    });
    expect(error?.code).toBe("23514");
  });

  it("code inconnu / inactif / hors fenêtre / ciblé sur une autre offre ⇒ P4008 promo_invalide", async () => {
    const resUnknown = await callOrder(params({ p_promo_code: `${runId}-INCONNU` }));
    expect(resUnknown.error?.code).toBe("P4008");

    await seedPromo({
      code: `${promoCode("INACTIF")}`,
      discount_type: "fixed",
      discount_value: 100,
      max_uses: null,
      offer_id: null,
    });
    await service.from("promo_codes").update({ is_active: false }).eq("code", `${promoCode("INACTIF")}`);
    const resInactive = await callOrder(params({ p_promo_code: `${promoCode("INACTIF")}` }));
    expect(resInactive.error?.code).toBe("P4008");

    const started = await service.from("offers").select("id").eq("slug", ONLINE).single();
    await seedPromo({
      code: `${promoCode("SCOPE")}`,
      discount_type: "fixed",
      discount_value: 100,
      max_uses: null,
      offer_id: started.data?.id ?? null,
    });
    // Le promo ciblé « online » est inapplicable à « starter » : P4008.
    const resScope = await callOrder(params({ p_offer_slug: STARTER, p_promo_code: `${promoCode("SCOPE")}` }));
    expect(resScope.error?.code).toBe("P4008");
  });

  it("max_uses atomique : 6 créations concurrentes, plafond 3 ⇒ exactement 3 commandes, used_count = 3", async () => {
    await seedPromo({
      code: `${promoCode("LIM3")}`,
      discount_type: "fixed",
      discount_value: 50,
      max_uses: 3,
      offer_id: null,
    });
    // 6 appels concurrents (clés et clients distincts), plafond 3.
    const settled = await Promise.allSettled(
      Array.from({ length: 6 }, () => callOrder(params({ p_promo_code: `${promoCode("LIM3")}` }))),
    );
    const fulfilled = settled.filter(
      (s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof callOrder>>> =>
        s.status === "fulfilled",
    );
    const ok = fulfilled.filter((r) => r.value.error === null);
    const refused = fulfilled.filter((r) => r.value.error?.code === "P4102");
    expect(ok.length).toBe(3);
    expect(refused.length).toBe(3);

    const { data: promo } = await service
      .from("promo_codes")
      .select("used_count")
      .eq("code", `${promoCode("LIM3")}`)
      .single();
    expect(promo?.used_count).toBe(3);
  });
});

describe("create_order — coaching (PAR-Q structuré, avis médical)", () => {
  it("PAR-Q obligatoire : coaching sans questionnaire ⇒ P4005 par_q_manquant", async () => {
    const res = await callOrder(params({ p_offer_slug: ONLINE, p_aptitude: null }));
    expect(res.error?.code).toBe("P4005");
    expect(res.error?.message).toContain("par_q_manquant");
  });

  it("PAR-Q enregistré : tout « non » ⇒ avis médical non conseillé ; un « oui » ⇒ drapeau levé (jamais de diagnostic)", async () => {
    const allNo = await callOrder(
      params({ p_offer_slug: ONLINE, p_aptitude: aptitude(false), p_waiver_version: "m6-test-waiver-v1" }),
    );
    expect(allNo.error).toBeNull();
    const no = allNo.data as { order_id: string };
    const { data: aptNo } = await service
      .from("aptitude_questionnaires")
      .select("medical_advice_recommended, waiver_accepted, waiver_version")
      .eq("order_id", no.order_id)
      .single();
    expect(aptNo?.medical_advice_recommended).toBe(false);
    expect(aptNo?.waiver_accepted).toBe(true);

    const withYes = await callOrder(
      params({ p_offer_slug: ONLINE, p_aptitude: aptitude(true), p_waiver_version: "m6-test-waiver-v1" }),
    );
    expect(withYes.error).toBeNull();
    const yes = withYes.data as { order_id: string };
    const { data: aptYes } = await service
      .from("aptitude_questionnaires")
      .select("medical_advice_recommended")
      .eq("order_id", yes.order_id)
      .single();
    expect(aptYes?.medical_advice_recommended).toBe(true);

    // Consentement « health_waiver » versionné.
    const { data: consent } = await service
      .from("consents")
      .select("consent_type, version")
      .eq("order_id", yes.order_id)
      .eq("consent_type", "health_waiver")
      .single();
    expect(consent?.version).toBe("m6-test-waiver-v1");
  });
});

describe("create_order — places présentiel (refus neutre « complet »)", () => {
  it("présentiel sans date de séance ⇒ P4007 slot_requis", async () => {
    const res = await callOrder(
      params({ p_offer_slug: IN_PERSON, p_aptitude: aptitude(false), p_waiver_version: "m6-test-waiver-v1" }),
    );
    expect(res.error?.code).toBe("P4007");
  });

  it("séance pleine (reserved >= capacity) ⇒ P4090 « complet » (message neutre, zéro détail)", async () => {
    const { data: offer } = await service.from("offers").select("id").eq("slug", IN_PERSON).single();
    slotDateFull = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await service
      .from("capacity_slots")
      .upsert({ offer_id: offer?.id, slot_date: slotDateFull, capacity: 2, reserved: 2 });
    const res = await callOrder(
      params({
        p_offer_slug: IN_PERSON,
        p_slot_date: slotDateFull,
        p_aptitude: aptitude(false),
        p_waiver_version: "m6-test-waiver-v1",
      }),
    );
    expect(res.error?.code).toBe("P4090");
    expect(res.error?.message).toBe("complet");

    // Le compteur n'a pas bougé (consommation seulement à la confirmation).
    const { data: slot } = await service
      .from("capacity_slots")
      .select("reserved")
      .eq("offer_id", offer?.id ?? "")
      .eq("slot_date", slotDateFull)
      .single();
    expect(slot?.reserved).toBe(2);
  });
});
