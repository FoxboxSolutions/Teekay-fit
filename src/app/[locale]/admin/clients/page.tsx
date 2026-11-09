import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.clients" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  phone_norm: string | null;
  created_at: string;
};
type OrderRow = {
  id: string;
  reference: string;
  status: string;
  total_da: number;
  created_at: string;
  customer_id: string;
};
type PaymentRow = {
  order_id: string;
  status: string;
  amount_da: number;
};
type AptitudeRow = {
  order_id: string;
  medical_advice_recommended: boolean;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "En attente de paiement",
  paid: "Payé",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

const MID_DOT = " · ";
const UNIT_DA = " DA";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ customer?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.clients");

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

  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const customerId = sp.customer ?? undefined;

  const { data: customersRaw, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const rows: CustomerRow[] = (customersRaw ?? []) as CustomerRow[];

  let detail: { customer: CustomerRow; orders: OrderRow[]; aptitude: AptitudeRow | null } | null =
    null;

  if (customerId) {
    const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).single();
    const { data: ordersRaw } = await supabase.from("orders").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
    const orderIds = (ordersRaw ?? []).map((o) => o.id);
    const { data: aptitudesRaw } = await supabase.from("aptitude_questionnaires").select("*").in("order_id", orderIds);
    detail = {
      customer: customer!,
      orders: (ordersRaw ?? []) as unknown as OrderRow[],
      aptitude: (aptitudesRaw ?? [])[0] ?? null,
    };
  }

  return (
    <section>
      <h1 className="font-display text-2xl font-bold mb-2">{t("title")}</h1>

      <ul className="space-y-3 mb-8">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("noCustomers")}</p>
        ) : (
          rows.map((c) => (
            <li key={c.id} className="border border-line bg-surface p-3 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold">{c.name}</span>
                    <a
                      className="underline text-sm font-medium"
                      href={`?customer=${c.id}`}
                    >
                      {t("voirFiche")}
                    </a>
                  </div>
                  <div className="text-sm text-ink-muted mt-1">
                    {c.phone ?? "—"}{MID_DOT}{c.email ?? "—"}
                  </div>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      {detail && (
        <section className="border border-line bg-surface p-6 rounded-lg">
          <h2 className="font-semibold mb-3">{t("ficheTitle", { name: detail.customer.name })}</h2>
          <p className="text-sm text-ink-muted mb-4">
            {detail.customer.phone ?? "—"}{MID_DOT}{detail.customer.email ?? "—"}
          </p>

          <h3 className="font-medium mb-2">{t("commandes")}</h3>
          {detail.orders.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("aucuneCommande")}</p>
          ) : (
            <ul className="space-y-2">
              {detail.orders.map((o) => {
                const payment = (o as unknown as { payments: PaymentRow[] }).payments?.[0];
                return (
                  <li key={o.id} className="text-sm flex justify-between">
                    <span>{o.reference}</span>
                    <span>
                      {STATUS_LABELS[o.status] ?? o.status}{MID_DOT}
                      {payment ? payment.amount_da : o.total_da}{UNIT_DA}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="font-medium mb-2 mt-6">{t("parQ")}</h3>
          {detail.aptitude ? (
            <ul className="space-y-1">
              <li className="text-sm">
                {t("parQRempli")}{MID_DOT}
                {detail.aptitude.medical_advice_recommended
                  ? <span className="font-medium text-red-text">{t("avisMedicalOui")}</span>
                  : <span>{t("avisMedicalNon")}</span>}
              </li>
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t("parQNonRempli")}</p>
          )}
        </section>
      )}
    </section>
  );
}
