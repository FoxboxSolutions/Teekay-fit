import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import {
  newLeads,
  leadsToFollowUp,
  ordersCount,
  confirmedRevenue,
  paymentsVerifyingCount,
  quizCompletion,
  conversionByOffer,
  type Indicator,
} from "@/lib/admin/indicators";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.dashboard" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function fmtPct(rate: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rate);
}

/** Séparateur numérateur / dénominateur (jamais de texte en dur). */
const SEP_RES = " / ";

/** Rend la valeur de l'indicateur, ou « non disponible » quand sa source
 * fait défaut (jamais d'estimation). */
function indicatorCell<T>(
  ind: Indicator<T>,
  render: (v: T) => string,
  unavailableLabel: string,
): React.ReactNode {
  return ind.available ? (
    <span>{render(ind.value)}</span>
  ) : (
    <span className="text-ink-muted">{unavailableLabel}</span>
  );
}

export default async function AdminHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.dashboard");

  const guard = await requireAdminAal2();
  if (!guard.ok) {
    if (guard.error === "not_admin") {
      return (
        <section className="mb-6">
          <p className="text-sm text-ink-muted">{t("notAdmin")}</p>
        </section>
      );
    }
    redirect("./mfa");
  }

  const now = new Date();
  const [
    leadsRes,
    followUpRes,
    ordersDayRes,
    ordersMonthRes,
    revenueRes,
    verifyingRes,
    quizRes,
    conversionRes,
  ] = await Promise.all([
    newLeads({ kind: "day", at: now }),
    leadsToFollowUp({ kind: "day", at: now }),
    ordersCount({ kind: "day", at: now }),
    ordersCount({ kind: "month", at: now }),
    confirmedRevenue({ kind: "month", at: now }),
    paymentsVerifyingCount(),
    quizCompletion({ kind: "day", at: now }),
    conversionByOffer({ kind: "month", at: now }),
  ]);

  return (
    <section>
      <h1 className="font-display text-2xl font-bold mb-2">{t("title")}</h1>
      <p className="text-sm text-ink-muted mb-6">
        {t("periodNote")}
      </p>

      <h2 className="font-semibold text-lg mb-3">{t("indicators")}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <IndicatorRow label={t("newLeads")} unit={t("unitLeads")}>
          {indicatorCell(leadsRes, (v) => fmtInt(v), t("unavailable"))}
        </IndicatorRow>
        <IndicatorRow label={t("leadsToFollowUp")} unit={t("unitLeads")}>
          {followUpRes.available ? (
            <span>{fmtInt(followUpRes.value.count)}{SEP_RES}{fmtInt(followUpRes.value.totalActive)}</span>
          ) : (
            <span className="text-ink-muted">{t("unavailable")}</span>
          )}
        </IndicatorRow>
        <IndicatorRow label={t("ordersDay")} unit={t("unitLeads")}>
          {indicatorCell(ordersDayRes, (v) => fmtInt(v), t("unavailable"))}
        </IndicatorRow>
        <IndicatorRow label={t("ordersMonth")} unit={t("unitLeads")}>
          {indicatorCell(ordersMonthRes, (v) => fmtInt(v), t("unavailable"))}
        </IndicatorRow>
        <IndicatorRow label={t("revenueConfirmed")} unit={t("unitDa")}>
          {indicatorCell(revenueRes, (v) => `${fmtInt(v)} ${t("unitDa")}`, t("unavailable"))}
        </IndicatorRow>
        <IndicatorRow label={t("paymentsVerifying")} unit={t("unitLeads")}>
          {indicatorCell(verifyingRes, (v) => fmtInt(v), t("unavailable"))}
        </IndicatorRow>
        <IndicatorRow label={t("quizCompletion")} unit={t("rate")}>
          {indicatorCell(quizRes, (v) => fmtPct(v.rate), t("unavailable"))}
        </IndicatorRow>
      </dl>

      <section className="mb-6">
        <h3 className="font-semibold mb-2">{t("conversionByOffer")}</h3>
        {conversionRes.available ? (
          conversionRes.value.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("unavailable")}</p>
          ) : (
            <ul className="space-y-2">
              {conversionRes.value.map((c) => (
                <li key={c.offerSlug} className="text-sm flex justify-between">
                  <span>{c.offerSlug}</span>
                  <span>
                    {c.leads > 0 ? `${fmtPct(c.rate)} (${c.converted}/${c.leads})` : t("unavailable")}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-sm text-ink-muted">{t("unavailable")}</p>
        )}
      </section>

      <nav className="mt-10 space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-ink-muted">{t("navTitle")}</h3>
        <ul className="space-y-1">
          <li>
            <a className="underline" href={t("atreatHref")}>
              {t("atreat")}
            </a>
          </li>
          <li><a className="underline" href={t("leadsHref")}>{t("navLeads")}</a></li>
          <li><a className="underline" href={t("clientsHref")}>{t("navClients")}</a></li>
          <li><a className="underline" href={t("ordersHref")}>{t("navOrders")}</a></li>
          <li><a className="underline" href={t("paymentsHref")}>{t("navPayments")}</a></li>
          <li><a className="underline" href={t("mfaHref")}>{t("navMfa")}</a></li>
        </ul>
      </nav>
    </section>
  );
}

function IndicatorRow({
  label,
  unit,
  children,
}: {
  label: string;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line bg-surface p-3 rounded-lg">
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="font-display font-bold mt-1">{children}</dd>
      <p className="text-xs text-ink-muted mt-1">{unit}</p>
    </div>
  );
}
