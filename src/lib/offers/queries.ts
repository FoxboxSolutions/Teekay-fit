import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability/logger";

/**
 * Client Supabase public (anon, sans session) pour la lecture du contenu
 * public (offres, places restantes). Contrairement à createSupabaseServerClient,
 * il n'utilise pas les cookies : les pages statiques/ISR peuvent l'appeler au
 * build et au runtime sans devenir dynamiques.
 */
let client: SupabaseClient | null = null;

function publicClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes");
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export type Offer = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  offer_type: string;
  price_da: number;
  currency: string;
  inclusions: string[] | null;
  exclusions: string[] | null;
  duration: string | null;
  conditions: string | null;
};

const OFFER_COLUMNS =
  "id, slug, name, description, offer_type, price_da, currency, inclusions, exclusions, duration, conditions";

/** Les offres actives, triées par prix croissant. En cas d'erreur : état vide honnête + journal structuré. */
export async function getOffers(): Promise<Offer[]> {
  try {
    const { data, error } = await publicClient()
      .from("offers")
      .select(OFFER_COLUMNS)
      .eq("is_active", true)
      .order("price_da", { ascending: true });

    if (error) {
      logEvent({ level: "error", event: "offers.fetch_failed", message: error.message });
      return [];
    }
    return (data ?? []) as Offer[];
  } catch (err) {
    logEvent({
      level: "error",
      event: "offers.fetch_exception",
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Une offre active par son slug, ou null. */
export async function getOfferBySlug(slug: string): Promise<Offer | null> {
  try {
    const { data, error } = await publicClient()
      .from("offers")
      .select(OFFER_COLUMNS)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      logEvent({ level: "error", event: "offers.fetch_by_slug_failed", slug, message: error.message });
      return null;
    }
    return (data as Offer | null) ?? null;
  } catch (err) {
    logEvent({
      level: "error",
      event: "offers.fetch_by_slug_exception",
      slug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Places restantes réelles pour une offre : somme (capacity - reserved) des
 * créneaux à venir. Retourne null s'il n'y a aucune donnée (compteur masqué),
 * jamais un faux chiffre.
 */
export async function getOfferRemainingSlots(offerId: string): Promise<number | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await publicClient()
      .from("capacity_slots")
      .select("slot_date, capacity, reserved")
      .eq("offer_id", offerId)
      .gte("slot_date", today);

    if (error) {
      logEvent({ level: "error", event: "capacity.fetch_failed", offerId, message: error.message });
      return null;
    }
    if (!data || data.length === 0) return null;

    const total = data.reduce((sum, row) => sum + (row.capacity - row.reserved), 0);
    return total;
  } catch (err) {
    logEvent({
      level: "error",
      event: "capacity.fetch_exception",
      offerId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Nombre d'offres actives (utilisé par /api/health). */
export async function getActiveOffersCount(): Promise<number | null> {
  try {
    const { count, error } = await publicClient()
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (error) {
      logEvent({ level: "error", event: "offers.count_failed", message: error.message });
      return null;
    }
    return count;
  } catch (err) {
    logEvent({
      level: "error",
      event: "offers.count_exception",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
