import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dayRangeAlgiers } from "@/lib/admin/period";
import { Button } from "@/components/ui/button";
import { LeadActions, type LeadRow } from "@/components/admin/lead-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.leads" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

type SearchParams = {
  search?: string;
  status?: string;
  source?: string;
  offer?: string;
  follow_up?: string;
};

const STATUS_KEYS: Record<string, string> = {
  new: "statusNew",
  contacted: "statusContacted",
  interested: "statusInterested",
  follow_up: "statusFollowUp",
  converted: "statusConverted",
  lost: "statusLost",
};

const SOURCE_KEYS: Record<string, string> = {
  quiz: "sourceQuiz",
  contact: "sourceContact",
  site: "sourceSite",
  instagram: "sourceInstagram",
  tiktok: "sourceTiktok",
  facebook: "sourceFacebook",
  google: "sourceGoogle",
  parrainage: "sourceParrainage",
  autre: "sourceAutre",
};

/** Échappe les caractères spéciaux d'un motif LIKE Postgres. */
function likeEscape(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

/** Séparateurs affichés (pas de texte en dur dans le JSX). */
const MID_DOT = " · ";
const KV_SEP = ": ";

function mergeSearchParams(
  current: SearchParams,
  overrides: Partial<SearchParams>,
): string {
  const merged: Record<string, string | undefined> = {
    search: current.search,
    status: current.status,
    source: current.source,
    offer: current.offer,
    follow_up: current.follow_up,
    ...overrides,
  };
  const pairs = Object.entries(merged).filter(([, v]) => v !== undefined && v !== "");
  return "?" + pairs.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
}

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.leads");

  const guard = await requireAdminAal2();
  if (!guard.ok) {
    if (guard.error === "not_admin") {
      return (
        <section className="mb-6">
          <p className="text-sm text-ink-muted">{t("notAdmin")}</p>
        </section>
      );
    }
    redirect(`/${locale}/admin/mfa`);
  }

  const sp = await searchParams;
  const search = (sp.search ?? "").trim();
  const statusFilter = sp.status ?? undefined;
  const sourceFilter = sp.source ?? undefined;
  const offerFilter = sp.offer ?? undefined;
  const followUp = sp.follow_up === "1";

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("leads").select("*");
  if (search) {
    const safe = likeEscape(search);
    query = query.or(`name.ilike.%${safe}%,phone_norm.ilike.%${safe}%`);
  }
  if (statusFilter) query = query.eq("status", statusFilter);
  if (sourceFilter) query = query.eq("source", sourceFilter);
  if (offerFilter) query = query.eq("offer_slug", offerFilter);
  if (followUp) {
    const day = dayRangeAlgiers(new Date());
    query = query.not("next_follow_up_at", "is", null).gte("next_follow_up_at", day.start).lt("next_follow_up_at", day.end);
  }
  query = query.order("created_at", { ascending: false });

const { data: leadsData, error } = await query;
  if (error) throw error;
  const rows: LeadRow[] = (leadsData ?? []) as unknown as LeadRow[];

  const statusLabel = (value: string): string => t(STATUS_KEYS[value] ?? "statusNew");
  const sourceLabel = (value: string): string => t(SOURCE_KEYS[value] ?? value);

  return (
    <section>
      <h1 className="font-display text-2xl font-bold mb-2">{t("title")}</h1>

      <form action={mergeSearchParams(sp, {})} className="grid gap-3 sm:grid-cols-4 mb-6">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-ink-muted">{t("search")}</span>
          <input
            name="search"
            defaultValue={search}
            className="border border-line bg-surface text-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-text"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-ink-muted">{t("filterStatus")}</span>
          <select name="status" className="border border-line bg-surface text-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-text">
            <option value="">{t("filterStatus")}</option>
            {["new", "contacted", "interested", "follow_up", "converted", "lost"].map((s) => (
              <option key={s} value={s} selected={statusFilter === s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-ink-muted">{t("filterSource")}</span>
          <select name="source" className="border border-line bg-surface text-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-text">
            <option value="">{t("filterSource")}</option>
            {Object.entries(SOURCE_KEYS).map(([v]) => (
              <option key={v} value={v} selected={sourceFilter === v}>
                {sourceLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-ink-muted">{t("filterOffer")}</span>
          <select name="offer" className="border border-line bg-surface text-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-text">
            <option value="">{t("filterOffer")}</option>
            <option value="starter" selected={offerFilter === "starter"}>
              {t("offerStarter")}
            </option>
            <option value="online" selected={offerFilter === "online"}>
              {t("offerOnline")}
            </option>
            <option value="in-person" selected={offerFilter === "in-person"}>
              {t("offerInPerson")}
            </option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-ink-muted">{t("filterFollowUp")}</span>
          <select name="follow_up" className="border border-line bg-surface text-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-text">
            <option value="" selected={!followUp}>{t("filterFollowUp")}</option>
            <option value="1" selected={followUp}>{t("followUpYes")}</option>
          </select>
        </label>
        <div className="flex gap-2 sm:flex-col sm:gap-2">
          <Button type="submit">{t("apply")}</Button>
          <a className="underline text-sm text-ink-muted" href={mergeSearchParams(sp, {})}>
            {t("reset")}
          </a>
        </div>
      </form>

      <ul className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : (
          rows.map((lead) => (
            <li key={lead.id} className="border border-line bg-surface p-3 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold">{lead.name}</span>
                    <span className="text-xs uppercase tracking-wide text-ink-muted">{statusLabel(lead.status)}</span>
                  </div>
                  <div className="text-sm text-ink-muted mt-1">
                    {lead.phone ?? "—"}{MID_DOT}{sourceLabel(lead.source)}{MID_DOT}{
                      lead.offer_slug ?? "—"
                    }
                  </div>
                  {lead.next_follow_up_at && (
                    <div className="text-xs text-ink-muted mt-1">
                      {t("colFollowUp")}{KV_SEP}{" "}
                      {new Date(lead.next_follow_up_at).toLocaleString("fr-FR", { timeZone: "Africa/Algiers" })}
                    </div>
                  )}
                </div>
                <LeadActions lead={lead} />
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
