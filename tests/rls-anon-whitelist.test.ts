import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalEnv } from "./helpers/env";

const env = getLocalEnv();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let service: SupabaseClient;
let anon: SupabaseClient;

/**
 * Liste blanche : SEULES ces tables sont lisibles en anon.
 * Toute nouvelle table lisible hors de cette liste = test échouant.
 * Toute table créée SANS RLS activée = test échouant (audit SQL).
 */
const ANON_READABLE = new Set(["offers", "capacity_slots"]);

type TableAudit = { table_name: string; rls_enabled: boolean };

let tables: TableAudit[] = [];

beforeAll(async () => {
  service = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await service.rpc("audit_rls_status");
  if (error) throw new Error(`audit_rls_status: ${error.message}`);
  tables = data as TableAudit[];

  const { data: offer } = await service
    .from("offers")
    .insert({ slug: `wl-${suffix}`, name: "WL", offer_type: "starter", price_da: 100, is_active: true })
    .select("id")
    .single();
  if (offer) {
    await service.from("capacity_slots").insert({
      offer_id: offer.id, slot_date: "2030-05-01", capacity: 3,
    });
  }
}, 120_000);

afterAll(async () => {
  const { data: offer } = await service.from("offers").select("id").eq("slug", `wl-${suffix}`);
  const id = offer?.[0]?.id;
  if (id) {
    await service.from("capacity_slots").delete().eq("offer_id", id);
    await service.from("offers").delete().eq("id", id);
  }
});

describe("audit — RLS activée sur toutes les tables", () => {
  it("l'audit retourne des tables (RPC disponible)", () => {
    expect(tables.length).toBeGreaterThanOrEqual(20);
  });

  it("chaque table du schéma public a RLS activée (refus par défaut)", () => {
    const withoutRls = tables.filter((t) => !t.rls_enabled);
    expect(withoutRls.map((t) => t.table_name)).toEqual([]);
  });

  it("aucune table de la liste blanche n'est oubliée par l'inventaire", () => {
    const names = new Set(tables.map((t) => t.table_name));
    for (const table of ANON_READABLE) {
      expect(names.has(table)).toBe(true);
    }
  });
});

describe("accès anon — table-driven avec liste blanche", () => {
  it("chaque table : seule la liste blanche est lisible en anon", async () => {
    const violations: string[] = [];
    const results: Record<string, string> = {};

    for (const { table_name: table } of tables) {
      const { data, error } = await anon.from(table).select("*").limit(1);

      if (error) {
        // Refus attendu : permission denied (42501) ou table hors cache.
        results[table] = "refus";
        continue;
      }

      const rows = data ?? [];
      if (ANON_READABLE.has(table)) {
        results[table] = `lu (${rows.length})`;
      } else {
        results[table] = "LISIBLE — VIOLATION";
        violations.push(table);
      }
    }

    console.log("Anon table-driven:", JSON.stringify(results, null, 2));
    expect(violations).toEqual([]);
  });

  it("offers en anon : jamais la moindre offre inactive", async () => {
    const { data, error } = await anon.from("offers").select("id, is_active");
    expect(error).toBeNull();
    expect((data ?? []).every((o) => o.is_active === true)).toBe(true);
  });
});
