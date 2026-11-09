import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dayRangeAlgiers, monthRangeAlgiers } from "@/lib/admin/period";

/**
 * Indicateurs reels du dashboard admin (M9a).
 * Chaque indicateur se calcule sur des données stockees. Sans source
 * stockee => { available: false } : l'afficheur rend « non disponible »,
 * jamais une estimation. Periodes en Africa/Algiers (jamais UTC).
 */

export type Indicator<T> =
  | { available: true; value: T }
  | { available: false; reason: "no_source" };

export type PeriodKind = "day" | "month";

export interface PeriodOption {
  kind: PeriodKind;
  /** Instant de reference (defaut : maintenant). Les bornes sont calculees
   * en Africa/Algiers a partir de cet instant. */
  at?: Date;
}

type LeadRow = {
  status: string;
  next_follow_up_at: string | null;
  offer_slug: string;
  created_at: string;
};

type OrderRow = {
  total_da: number;
  status: string;
  payments: { status: string }[];
  created_at: string;
};

function range(option: PeriodOption): { start: string; end: string } {
  const at = option.at ?? new Date();
  return option.kind === "day" ? dayRangeAlgiers(at) : monthRangeAlgiers(at);
}

function inAlgiersPeriod(value: string | null, start: string, end: string): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  return t >= new Date(start).getTime() && t < new Date(end).getTime();
}

const ACTIVE_STATUSES = ["new", "contacted", "interested", "follow_up"] as const;

/** Nombre de leads crees dans la periode (compte absolu). */
export async function newLeads(option: PeriodOption): Promise<Indicator<number>> {
  const supabase = await createSupabaseServerClient();
  const { start, end } = range(option);
  const { count, error } = await supabase
    .from("leads")
    .select("*", { head: true, count: "exact" })
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw error;
  return { available: true, value: count ?? 0 };
}

/**
 * Leads a relancer : actifs (pipeline) dont la prochaine relance tombe dans
 * la periode. Denominateur = effectif du pipeline actif (quelle que soit la
 * date de la prochaine relance).
 */
export async function leadsToFollowUp(option: PeriodOption): Promise<Indicator<{ count: number; totalActive: number }>> {
  const supabase = await createSupabaseServerClient();
  const { start, end } = range(option);
  const { data: leads, error } = await supabase
    .from("leads")
    .select("status, next_follow_up_at")
    .in("status", ACTIVE_STATUSES);
  if (error) throw error;
  const rows = (leads ?? []) as LeadRow[];
  const count = rows.filter((row) => inAlgiersPeriod(row.next_follow_up_at, start, end)).length;
  return { available: true, value: { count, totalActive: rows.length } };
}

/** Nombre de commandes crees dans la periode (compte absolu). */
export async function ordersCount(option: PeriodOption): Promise<Indicator<number>> {
  const supabase = await createSupabaseServerClient();
  const { start, end } = range(option);
  const { count, error } = await supabase
    .from("orders")
    .select("*", { head: true, count: "exact" })
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw error;
  return { available: true, value: count ?? 0 };
}

/**
 * Revenu confirme : somme des total_da des commandes de la periode dont un
 * paiement lie est confirme et la commande non remboursee.
 * Montant retenu : copie figuree orders.total_da (jamais recalculee).
 */
export async function confirmedRevenue(option: PeriodOption): Promise<Indicator<number>> {
  const supabase = await createSupabaseServerClient();
  const { start, end } = range(option);
  const { data: orders, error } = await supabase
    .from("orders")
    .select("total_da, status, payments!inner(status)")
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw error;
  const rows = (orders ?? []) as OrderRow[];
  const value = rows.reduce((acc: number, row: OrderRow) => {
    const confirmed = row.payments.some((p) => p.status === "confirmed");
    if (confirmed && row.status !== "refunded") return acc + row.total_da;
    return acc;
  }, 0);
  return { available: true, value };
}

/** Nombre de paiements en attente de verification admin (status verifying). */
export async function paymentsVerifyingCount(): Promise<Indicator<number>> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("payments")
    .select("*", { head: true, count: "exact" })
    .eq("status", "verifying");
  if (error) throw error;
  return { available: true, value: count ?? 0 };
}

/**
 * Taux de completion du quiz : soumissions terminees / soumissions demarrees
 * sur la periode. Disponible car started_at est persiste ; si la source
 * n'etait pas persistee, l'appelant rendrait { available: false }.
 */
export async function quizCompletion(option: PeriodOption): Promise<Indicator<{ started: number; completed: number; rate: number }>> {
  const supabase = await createSupabaseServerClient();
  const { start, end } = range(option);
  const { data: submissions, error } = await supabase
    .from("quiz_submissions")
    .select("started_at, completed_at")
    .gte("started_at", start)
    .lt("started_at", end);
  if (error) throw error;
  const rows = (submissions ?? []) as { started_at: string | null; completed_at: string | null }[];
  const started = rows.length;
  const completed = rows.filter((row) => !!row.completed_at).length;
  return { available: true, value: { started, completed, rate: started === 0 ? 0 : completed / started } };
}

/**
 * Conversion par offre sur la periode : leads crees et convertis, taux par
 * offre. Une offre sans lead sur la periode -> non disponible pour elle.
 */
export async function conversionByOffer(option: PeriodOption): Promise<Indicator<Array<{ offerSlug: string; leads: number; converted: number; rate: number }>>> {
  const supabase = await createSupabaseServerClient();
  const { start, end } = range(option);
  const { data: leads, error } = await supabase
    .from("leads")
    .select("offer_slug, status")
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw error;
  const bySlug = new Map<string, { leads: number; converted: number }>();
  for (const row of leads ?? []) {
    const slug = (row as { offer_slug: string }).offer_slug;
    if (!bySlug.has(slug)) bySlug.set(slug, { leads: 0, converted: 0 });
    const agg = bySlug.get(slug)!;
    agg.leads += 1;
    if ((row as { status: string }).status === "converted") agg.converted += 1;
  }
  const value = Array.from(bySlug.entries()).map(([offerSlug, agg]) => ({
    offerSlug,
    leads: agg.leads,
    converted: agg.converted,
    rate: agg.leads === 0 ? 0 : agg.converted / agg.leads,
  }));
  return { available: true, value };
}
