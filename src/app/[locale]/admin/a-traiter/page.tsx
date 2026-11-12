import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dayRangeAlgiers } from "@/lib/admin/period";
import { OutboxResendButton } from "@/components/admin/outbox-resend-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.aTraiter" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  status: string;
  created_at: string;
};
type PaymentRow = {
  id: string;
  order_id: string;
  amount_da: number;
  created_at: string;
};
type OrderRow = {
  id: string;
  reference: string;
  total_da: number;
  status: string;
  needs_admin_review: boolean;
  created_at: string;
};
type OutboxRow = {
  id: string;
  payment_id: string;
  event_type: string;
  recipient: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};
type MedicalRow = {
  id: string;
  order_id: string;
  medical_advice_recommended: boolean;
  created_at: string;
};

/** Séparateurs affichés (pas de texte en dur dans le JSX). */
const UNIT_DA = " DA";
const KV_SEP = ": ";
export default async function ATraiterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.aTraiter");

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

  const now = new Date();
  const day = dayRangeAlgiers(now);

  const supabase = await createSupabaseServerClient();
  const admin = await createSupabaseAdminClient();

  type DbResult = { data: unknown; error: unknown };

  const results = await Promise.all([
    (async () => {
      const r = await supabase
        .from("leads")
        .select("id, name, phone, source, status, created_at")
        .gte("created_at", day.start)
        .lt("created_at", day.end)
        .order("created_at", { ascending: false });
      return r as DbResult;
    })(),
    (async () => {
      const r = await supabase
        .from("payments")
        .select("id, order_id, amount_da, created_at")
        .eq("status", "verifying")
        .order("created_at", { ascending: false });
      return r as DbResult;
    })(),
    (async () => {
      const r = await supabase
        .from("orders")
        .select("id, reference, total_da, status, needs_admin_review, created_at")
        .eq("needs_admin_review", true)
        .order("created_at", { ascending: false });
      return r as DbResult;
    })(),
    (async () => {
      const r = await admin
        .from("email_outbox")
        .select("id, payment_id, event_type, recipient, status, attempts, last_error, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false });
      return r as DbResult;
    })(),
    (async () => {
      const r = await supabase
        .from("aptitude_questionnaires")
        .select("id, order_id, medical_advice_recommended, created_at")
        .eq("medical_advice_recommended", true)
        .order("created_at", { ascending: false });
      return r as DbResult;
    })(),
  ]) as DbResult[];

  const leads: LeadRow[] = (results[0]!.data as LeadRow[] | null) ?? [];
  const paymentsList: PaymentRow[] = (results[1]!.data as PaymentRow[] | null) ?? [];
  const ordersList: OrderRow[] = (results[2]!.data as OrderRow[] | null) ?? [];
  const outboxList: OutboxRow[] = (results[3]!.data as OutboxRow[] | null) ?? [];
  const medicalList: MedicalRow[] = (results[4]!.data as MedicalRow[] | null) ?? [];

  return (
    <section>
      <h1 className="font-display text-2xl font-bold mb-2">{t("title")}</h1>
      <p className="text-sm text-ink-muted mb-6">{t("intro")}</p>

      <section className="mb-6">
        <h2 className="font-semibold mb-3">{t("leadsToday")}</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {leads.map((l) => (
              <li key={l.id} className="text-sm flex justify-between">
                <span>{l.name}</span>
                <span>{l.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-3">{t("paymentsVerifying")}</h2>
        {paymentsList.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {paymentsList.map((p) => (
              <li key={p.id} className="text-sm flex justify-between">
                <span>{p.order_id}</span>
                <span>{p.amount_da}{UNIT_DA}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-3">{t("ordersReview")}</h2>
        {ordersList.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {ordersList.map((o) => (
              <li key={o.id} className="text-sm flex justify-between">
                <span>{o.reference}</span>
                <span>{o.total_da}{UNIT_DA}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-3">{t("outboxFailed")}</h2>
        {outboxList.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {outboxList.map((e) => (
              <li key={e.id} className="text-sm flex justify-between">
                <span>{e.recipient}</span>
                <span>{t("colAttempts")}{KV_SEP}{e.attempts}</span>
                <OutboxResendButton id={e.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-3">{t("medicalFlags")}</h2>
        {medicalList.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {medicalList.map((m) => (
              <li key={m.id} className="text-sm">
                {t("colReference")}{KV_SEP} {m.order_id}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
