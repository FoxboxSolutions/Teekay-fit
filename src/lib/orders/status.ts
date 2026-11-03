import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashStatusToken } from "@/lib/payments/status-token";

/**
 * Lecture du statut d'une commande par son jeton de statut (M6).
 *
 * Le jeton brut n'est JAMAIS stocké : la base ne contient que son SHA-256
 * (≥128 bits, 14 jours). La lecture passe par la RPC
 * `order_status_by_token` (expiration appliquée EN REQUÊTE) : jeton
 * inconnu, expiré ou mal formé ⇒ `missing` — page neutre IDENTIQUE dans
 * les trois cas, aucune différence observable (aucun oracle sur
 * l'existence d'une commande).
 */

/** Jeton base64url issu de randomBytes(32) : forme vérifiée avant tout accès base. */
export function isValidOrderStatusTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export type OrderStatusRow = {
  reference: string;
  order_status: string;
  total_da: number;
  created_at: string;
  status_token_expires_at: string;
};

export type OrderStatusLookup = { status: "found"; order: OrderStatusRow } | { status: "missing" };

export async function lookupOrderStatus(token: string): Promise<OrderStatusLookup> {
  const { data, error } = await createSupabaseAdminClient().rpc("order_status_by_token", {
    p_status_token_hash: hashStatusToken(token),
  });
  if (error) {
    logEventError(error.message);
    return { status: "missing" };
  }
  const rows = (data ?? []) as OrderStatusRow[];
  return rows.length > 0 ? { status: "found", order: rows[0]! } : { status: "missing" };
}

function logEventError(message: string): void {
  console.error(
    JSON.stringify({ level: "error", event: "order_status_fetch_failed", message }),
  );
}
