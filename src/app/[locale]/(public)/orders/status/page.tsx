import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import {
  isValidOrderStatusTokenFormat,
  lookupOrderStatus,
  type OrderStatusRow,
} from "@/lib/orders/status";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("fr-FR");
const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "order.status" });
  // Page de suivi personnelle : jamais indexée par les moteurs de recherche.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Libellés de statut exposés (vocables métier uniquement ; tout autre
 * statut interne ne s'affiche pas — jamais de détail technique).
 */
const STATUS_LABEL_KEYS = ["pending_payment", "paid", "refunded", "cancelled"] as const;
type StatusLabelKey = (typeof STATUS_LABEL_KEYS)[number];

function statusLabelKey(orderStatus: string): StatusLabelKey | null {
  return (STATUS_LABEL_KEYS as readonly string[]).includes(orderStatus)
    ? (orderStatus as StatusLabelKey)
    : null;
}

/**
 * Suivi de commande par jeton (M6). Jeton absent, inconnu ou expiré ⇒ page
 * neutre IDENTIQUE (aucune différence observable). Consultation limitée
 * en débit par IP hachée (lecture publique par jeton opaque).
 */
export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("order.status");

  // Limitation de débit en lecture (30 consultations / 10 min par IP hachée).
  const requestHeaders = await headers();
  const allowed = await checkRateLimit(ipRateLimitKey(requestHeaders, "order_status_ip"), 30, 600);

  const result =
    allowed && token && isValidOrderStatusTokenFormat(token)
      ? await lookupOrderStatus(token)
      : ({ status: "missing" } as const);

  if (result.status !== "found") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold uppercase">{t("neutralTitle")}</h1>
          <p className="mt-3 text-ink-muted">{t("neutralText")}</p>
          <div className="mt-6">
            <WhatsAppButton />
          </div>
        </Card>
      </main>
    );
  }

  const order: OrderStatusRow = result.order;
  const labelKey = statusLabelKey(order.order_status);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("title")}</h1>
      <Card className="mt-8 p-6">
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-sm font-semibold uppercase text-ink-muted">{t("reference")}</dt>
            <dd className="font-display text-2xl font-bold">{order.reference}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase text-ink-muted">{t("statusLabel")}</dt>
            {/* Statut inconnu interne : texte neutre du statut « en attente » (jamais un détail technique). */}
            <dd className="text-lg font-semibold">
              {labelKey ? t(labelKey) : t("pending_payment")}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase text-ink-muted">{t("amountLabel")}</dt>
            <dd className="font-display text-2xl font-bold">
              {nf.format(order.total_da)}{" "}
              <span className="text-xl text-ink-muted">{t("currency")}</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase text-ink-muted">{t("dateLabel")}</dt>
            <dd className="text-lg font-semibold">{df.format(new Date(order.created_at))}</dd>
          </div>
        </dl>
      </Card>
    </main>
  );
}
