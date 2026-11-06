import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * M8 (bloc 2b) — Résolution serveur d'un droit de téléchargement.
 *
 * TOUTE demande passe par ici, CÔTÉ SERVEUR, avec la SESSION connectée
 * (jamais le jeton de statut) — la source privée n'est jamais exposée.
 *
 * Résultats : UNIQUEMENT deux états — un « grant » complet, ou un échec.
 * Tous les échecs sont IDENTIQUES (404 neutre côté route) : droit absent,
 * d'un autre client, commande non confirmée (pending/cancelled/refunded),
 * droit révoqué, droit expiré, identifiant deviné, fichier d'une autre
 * offre. Aucune distinction observable (pas d'oracle d'existence).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GrantFile = {
  id: string;
  storagePath: string;
  label: string;
};

export type DownloadGrant = {
  entitlementId: string;
  orderId: string;
  reference: string;
  /** Données du filigrane (nom, téléphone — ce dernier TOUJOURS masqué). */
  clientName: string | null;
  phone: string | null;
  /** Fichiers de l'offre (tous, ou le fichier demandé). */
  files: GrantFile[];
};

export type ResolveResult =
  | { ok: true; grant: DownloadGrant }
  | { ok: false };

type EntitlementRow = {
  id: string;
  revoked_at: string | null;
  expires_at: string | null;
  order_item: { offer_id: string | null } | null;
  order: {
    id: string;
    status: string;
    reference: string;
    customer: { profile_id: string | null; name: string; phone: string | null } | null;
  } | null;
};

/**
 * Vérifie QUE le droit appartient à l'utilisateur ET qu'il est valide.
 * `fileId` (optionnel) : le fichier doit appartenir à l'offre de la ligne
 * de commande de CE droit (un identifiant de fichier d'une autre offre ⇒
 * échec identique).
 */
export async function resolveDownloadGrant(input: {
  userId: string | null;
  entitlementId: string;
  fileId?: string | null;
}): Promise<ResolveResult> {
  // Identifiant deviné / malformé : échec immédiat, même résultat.
  if (!input.userId || !UUID_RE.test(input.entitlementId)) return { ok: false };
  if (input.fileId && !UUID_RE.test(input.fileId)) return { ok: false };

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("entitlements")
    .select(
      "id,revoked_at,expires_at," +
        "order_item:order_items(offer_id)," +
        "order:orders(id,status,reference,customer:customers(profile_id,name,phone))",
    )
    .eq("id", input.entitlementId)
    .limit(1);
  if (error || !data || data.length === 0) return { ok: false };
  const row = data[0] as unknown as EntitlementRow;

  // Propriétaire : la ligne customer du profil courant.
  const order = row.order;
  const customer = order?.customer;
  if (!order || !customer || customer.profile_id !== input.userId) return { ok: false };

  // Commande confirmée (payée) UNIQUEMENT : pending/cancelled/refunded
  // n'ouvrent rien — jamais de droit sur une commande annulée/remboursée.
  if (order.status !== "paid") return { ok: false };

  // Droit révoqué ou EXPIRÉ ⇒ jamais présenté comme actif.
  if (row.revoked_at !== null) return { ok: false };
  if (row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false };
  }

  const offerId = row.order_item?.offer_id;
  if (!offerId) return { ok: false };

  // Fichiers de l'offre (filtrés sur le fichier demandé si présent).
  let filesQuery = admin
    .from("offer_files")
    .select("id,storage_path,label")
    .eq("offer_id", offerId)
    .order("created_at", { ascending: true });
  if (input.fileId) filesQuery = filesQuery.eq("id", input.fileId);
  const filesRes = await filesQuery;
  if (filesRes.error) return { ok: false };
  const files = (filesRes.data ?? []) as Array<{
    id: string;
    storage_path: string;
    label: string;
  }>;
  // Aucun fichier (demandé ou disponible) : même échec neutre.
  if (files.length === 0) return { ok: false };

  return {
    ok: true,
    grant: {
      entitlementId: row.id,
      orderId: order.id,
      reference: order.reference,
      clientName: customer.name,
      phone: customer.phone,
      files: files.map((f) => ({
        id: f.id,
        storagePath: f.storage_path,
        label: f.label,
      })),
    },
  };
}
