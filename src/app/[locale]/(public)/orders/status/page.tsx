import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { ProofForm } from "@/components/orders/proof-form";
import { checkRateLimit, ipRateLimitKey } from "@/lib/security/rate-limit";
import {
  isValidOrderStatusTokenFormat,
  lookupOrderStatus,
  type OrderStatusRow,
} from "@/lib/orders/status";
import {
  getBaridimobInstructions,
  getPaymentWindowHours,
  isPaymentWindowExpired,
} from "@/lib/settings";

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
const STATUS_LABEL_KEYS = [
  "pending_payment",
  "verifying",
  "paid",
  "refunded",
  "cancelled",
] as const;
type StatusLabelKey = (typeof STATUS_LABEL_KEYS)[number];

function statusLabelKey(orderStatus: string): StatusLabelKey | null {
  return (STATUS_LABEL_KEYS as readonly string[]).includes(orderStatus)
    ? (orderStatus as StatusLabelKey)
    : null;
}

/**
 * Suivi de commande par jeton (M6, enrichi M7a). Jeton absent, inconnu ou
 * expiré ⇒ page neutre IDENTIQUE (aucune différence observable).
 * M7a : paiement en attente → instructions BaridiMob (configurées en base
 * par le propriétaire) + formulaire de preuve ; en vérification → texte
 * clair ; confirmé → reçu PDF téléchargeable ; fenêtre de paiement
 * expirée → message clair (expiration automatique en M12, pg_cron).
 * Consultation limitée en débit par IP hachée (lecture publique par jeton
 * opaque).
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
  const isPending = order.order_status === "pending_payment";
  const isVerifying = order.order_status === "verifying";
  const isPaid = order.order_status === "paid";

  // Fenêtre de paiement (M7a) : durée configurable en base, défaut 48 h.
  const windowHours = isPending ? await getPaymentWindowHours() : 0;
  const windowExpired = isPending && isPaymentWindowExpired(order.created_at, windowHours);

  // Instructions BaridiMob : configurées par le propriétaire en base
  // (jamais en dur dans le dépôt) — affichées uniquement tant que le
  // paiement est attendu. Le numéro de compte est montré au client mais
  // ne figure ni dans les journaux ni dans les événements.
  const instructions = isPending && !windowExpired ? await getBaridimobInstructions() : null;

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

      {isPending && windowExpired && (
        <Card className="mt-6 border-amber-600 p-6">
          <h2 className="font-display text-lg font-bold">{t("windowExpiredTitle")}</h2>
          <p className="mt-2 text-sm text-ink-muted">{t("windowExpiredText")}</p>
          <div className="mt-4">
            <WhatsAppButton />
          </div>
        </Card>
      )}

      {isPending && !windowExpired && (
        <>
          <Card className="mt-6 p-6">
            <h2 className="font-display text-lg font-bold">{t("baridimobTitle")}</h2>
            <p className="mt-2 text-sm text-ink-muted">{t("baridimobIntro")}</p>
            <dl className="mt-4 flex flex-col gap-2">
              {instructions?.account !== null && instructions?.account !== undefined && (
                <div className="flex flex-col">
                  <dt className="text-xs font-semibold uppercase text-ink-muted">
                    {t("baridimobAccount")}
                  </dt>
                  <dd className="font-display text-lg font-bold select-all">
                    {instructions.account}
                  </dd>
                </div>
              )}
              {instructions?.bank !== null && instructions?.bank !== undefined && (
                <div className="flex flex-col">
                  <dt className="text-xs font-semibold uppercase text-ink-muted">
                    {t("baridimobBank")}
                  </dt>
                  <dd className="text-sm font-semibold">{instructions.bank}</dd>
                </div>
              )}
              {instructions?.beneficiary !== null && instructions?.beneficiary !== undefined && (
                <div className="flex flex-col">
                  <dt className="text-xs font-semibold uppercase text-ink-muted">
                    {t("baridimobBeneficiary")}
                  </dt>
                  <dd className="text-sm font-semibold">{instructions.beneficiary}</dd>
                </div>
              )}
              <div className="flex flex-col">
                <dt className="text-xs font-semibold uppercase text-ink-muted">
                  {t("baridimobMotif")}
                </dt>
                <dd className="font-display text-lg font-bold select-all">{order.reference}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs font-semibold uppercase text-ink-muted">
                  {t("baridimobAmount")}
                </dt>
                <dd className="font-display text-lg font-bold">
                  {nf.format(order.total_da)} {t("currency")}
                </dd>
              </div>
            </dl>
            {instructions?.note !== null && instructions?.note !== undefined && (
              <p className="mt-4 text-sm text-ink-muted">{instructions.note}</p>
            )}
          </Card>
          <div className="mt-6">
            {/* token ici : forme déjà validée avant la lecture (chaîne opaque du lien personnel). */}
            <ProofForm reference={order.reference} token={token ?? ""} />
          </div>
        </>
      )}

      {isVerifying && (
        <Card className="mt-6 p-6">
          <h2 className="font-display text-lg font-bold">{t("verifyingTitle")}</h2>
          <p className="mt-2 text-sm text-ink-muted">{t("verifyingText")}</p>
        </Card>
      )}

      {isPaid && token !== undefined && (
        <Card className="mt-6 p-6">
          <h2 className="font-display text-lg font-bold">{t("receiptTitle")}</h2>
          <p className="mt-2 text-sm text-ink-muted">{t("receiptText")}</p>
          <a
            href={`/api/orders/${order.reference}/receipt?statusToken=${token}`}
            download={`recu-${order.reference}.pdf`}
            className="mt-4 inline-block rounded-md border border-ink px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-ink transition-colors duration-base hover:bg-ink hover:text-paper"
          >
            {t("receiptAction")}
          </a>
        </Card>
      )}
    </main>
  );
}
