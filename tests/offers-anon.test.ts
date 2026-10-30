import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

const env = getLocalEnv();

let anon: SupabaseClient;

beforeAll(() => {
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(() => {
  anon?.auth.stopAutoRefresh();
});

describe("lecture des offres en anon (M4)", () => {
  it("les 3 offres seedées (PRD §5) sont lisibles par un visiteur non connecté", async () => {
    const { data, error } = await anon
      .from("offers")
      .select("slug, name, price_da, currency, is_active, duration")
      .eq("is_active", true)
      .order("price_da", { ascending: true });

    expect(error).toBeNull();
    const bySlug = new Map((data ?? []).map((o) => [o.slug, o]));
    expect(bySlug.get("starter")?.price_da).toBe(2000);
    expect(bySlug.get("online")?.price_da).toBe(6000);
    expect(bySlug.get("in-person")?.price_da).toBe(10000);
    for (const o of data ?? []) {
      expect(o.currency).toBe("DA");
      expect(o.is_active).toBe(true);
    }
  });

  it("les places restantes (capacity_slots) sont lisibles en anon", async () => {
    const { error } = await anon
      .from("capacity_slots")
      .select("offer_id, slot_date, capacity, reserved")
      .limit(1);
    expect(error).toBeNull();
  });

  it("le comptage d'offres actives fonctionne en anon (base de /api/health)", async () => {
    const { count, error } = await anon
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
