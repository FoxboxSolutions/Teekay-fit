import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAdminAal2 } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ParqAnswersButton } from "@/components/admin/parq-answers-button";

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
    redirect(`/${locale}/admin/mfa`);
  }

  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const customerId = sp.customer ?? undefined;

  const { data: customersRaw, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const rows: CustomerRow[] = (customersRaw ?? []) as CustomerRow[];

  let detail: {
    customer: CustomerRow;
    orders: OrderRow[];
    aptitudeByOrder: Map<string, AptitudeRow>;
    ordersWithParq: OrderRow[];
  } | null = null;

  if (customerId) {
    const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).single();
    const { data: ordersRaw } = await supabase.from("orders").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
    const orderIds = (ordersRaw ?? []).map((o) => o.id);
    // M9a (f) : AUCUNE colonne de réponse n'est lue ici — seulement
    // l'existence d'un questionnaire et le drapeau « avis médical
    // conseillé ». Les réponses ne sont accessibles que via la consultation
    // explicite, auditée (POST /api/admin/par-q).
    const { data: aptitudesRaw } = await supabase
      .from("aptitude_questionnaires")
      .select("order_id, medical_advice_recommended, created_at")
      .in("order_id", orderIds);
    const aptitudes = (aptitudesRaw ?? []) as AptitudeRow[];
    const aptitudeByOrder = new Map(aptitudes.map((a) => [a.order_id, a]));
    const orders = (ordersRaw ?? []) as unknown as OrderRow[];
    detail = {
      customer: customer!,
      orders,
      aptitudeByOrder,
      ordersWithParq: orders.filter((o) => aptitudeByOrder.has(o.id)),
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
          {detail.ordersWithParq.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("parQNonRempli")}</p>
          ) : (
            <ul className="space-y-2">
              {detail.ordersWithParq.map((o) => {
                const aptitude = detail.aptitudeByOrder.get(o.id)!;
                return (
                  <li key={o.id} className="text-sm">
                    <div className="flex justify-between">
                      <span>{o.reference}</span>
                      <span>
                        {t("parQRempli")}{MID_DOT}
                        {aptitude.medical_advice_recommended
                          ? <span className="font-medium text-red-text">{t("avisMedicalOui")}</span>
                          : <span>{t("avisMedicalNon")}</span>}
                      </span>
                    </div>
                    {/* Consultation EXPLICITE : les réponses ne sont lues
                        qu'après un clic, via une route auditée (M9a-f). */}
                    <ParqAnswersButton orderId={o.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
