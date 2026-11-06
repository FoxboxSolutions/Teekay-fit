import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Paramètres exploitables (M7a) : instructions BaridiMob et fenêtre de
 * paiement — configurés EN BASE par le propriétaire (jamais en dur dans le
 * dépôt). Cadence : lecture serveur UNIQUEMENT (service role — la table n'a
 * aucune policy anonyme).
 *
 * Règle d'hygiène : le numéro de compte (`is_secret = true`) ne figure ni
 * dans les journaux ni dans les événements ni dans les audits — aussi bien
 * côté base (audit sans valeur) que côté application (aucun log ici).
 */

export type BaridimobInstructions = {
  /** Numéro de compte (secret : affiché au client, jamais journalisé). */
  account: string | null;
  bank: string | null;
  beneficiary: string | null;
  note: string | null;
};

/** Défaut sûr : 48 h (aligné sur la fonction SQL payment_window_hours()). */
const DEFAULT_PAYMENT_WINDOW_HOURS = 48;

async function readSettings(keys: string[]): Promise<Map<string, string>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("site_settings")
    .select("key,value")
    .in("key", keys);
  const map = new Map<string, string>();
  if (error) {
    // Fail-safe : renvoie les défauts, aucun crash de page.
    console.error(
      JSON.stringify({ level: "error", event: "site_settings_fetch_failed" }),
    );
    return map;
  }
  for (const row of data ?? []) map.set(row.key, row.value);
  return map;
}

export async function getBaridimobInstructions(): Promise<BaridimobInstructions> {
  const map = await readSettings([
    "baridimob.account",
    "baridimob.bank",
    "baridimob.beneficiary",
    "baridimob.note",
  ]);
  return {
    account: map.get("baridimob.account") ?? null,
    bank: map.get("baridimob.bank") ?? null,
    beneficiary: map.get("baridimob.beneficiary") ?? null,
    note: map.get("baridimob.note") ?? null,
  };
}

export async function getPaymentWindowHours(): Promise<number> {
  const map = await readSettings(["payment_window_hours"]);
  const raw = map.get("payment_window_hours");
  if (!raw) return DEFAULT_PAYMENT_WINDOW_HOURS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 720
    ? parsed
    : DEFAULT_PAYMENT_WINDOW_HOURS;
}

/**
 * M8 — plafond de téléchargements PAR DROIT ET PAR JOUR (configurable en
 * base par le propriétaire). Défaut proposé : 10 (à confirmer avec le
 * coach — point ouvert milestone.md). Borné 1..1000 (valeur hors bornes
 * ⇒ défaut, jamais un blocage total ni un plafond vide).
 */
const DEFAULT_DOWNLOADS_DAILY_LIMIT = 10;

export async function getDownloadsDailyLimit(): Promise<number> {
  const map = await readSettings(["downloads_daily_limit"]);
  const raw = map.get("downloads_daily_limit");
  if (!raw) return DEFAULT_DOWNLOADS_DAILY_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000
    ? parsed
    : DEFAULT_DOWNLOADS_DAILY_LIMIT;
}

/** Commande pending_payment hors fenêtre (serveur, à partir de created_at). */
export function isPaymentWindowExpired(
  createdAt: string,
  windowHours: number,
  now: Date = new Date(),
): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created > windowHours * 3_600_000;
}
