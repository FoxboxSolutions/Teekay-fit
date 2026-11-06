import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDownloadGrant, type GrantFile } from "@/lib/files/entitlements";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  // Espace personnel du client : jamais indexé.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Libellés de statut exposés (vocables métier uniquement — même liste que
 * la page de suivi ; tout statut interne inconnu affiche le libellé « en
 * attente », jamais de détail technique).
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

const nf = new Intl.NumberFormat("fr-FR");
const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

type OrderRow = {
  id: string;
  reference: string;
  offer_name: string;
  status: string;
  total_da: number;
  created_at: string;
  entitlements:
    | Array<{ id: string; revoked_at: string | null; expires_at: string | null }>
    | null;
};

type RightView = {
  entitlementId: string;
  /** Droit révoqué ou expiré — jamais présenté comme actif. */
  inactive: boolean;
  files: GrantFile[];
};

/**
 * M8 (bloc 3a) — Page minimale « Mes commandes et mes PDF ».
 *
 * Sans session : carte neutre (aucun formulaire e-mail, aucune donnée).
 * Avec session : les commandes sont lues par le CLIENT SERVEUR (RLS
 * `orders_select_own` — le client ne voit que SES commandes via son
 * profil), les statuts sont affichés EXACTEMENT (mêmes vocables que la
 * page de suivi), le reçu n'est proposé que sur une commande confirmée,
 * et chaque droit de téléchargement passe par `resolveDownloadGrant`
 * (revalidation serveur) : un droit révoqué ou expiré n'ouvre AUCUN lien.
 *
 * Le portail complet (questionnaire, programmes, séances) reste en
 * Phase 2 (M13) — cette page n'affiche que commandes et fichiers.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");
  const ts = await getTranslations("order.status");

  const auth = await getAuthContext();

  if (!auth) {
    // Carte neutre : ni formulaire e-mail, ni donnée de commande. La
    // connexion se fait uniquement par le lien reçu après la commande.
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="font-display text-4xl font-bold uppercase">{t("title")}</h1>
        <Card className="mt-8 p-6">
          <h2 className="font-display text-lg font-bold">{t("signedOutTitle")}</h2>
          <p className="mt-3 text-ink-muted">{t("signedOutText")}</p>
          <div className="mt-6">
            <a
              href={`/${locale}/orders/status`}
              className="inline-block rounded-md border border-ink px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-ink transition-colors duration-base hover:bg-ink hover:text-paper"
            >
              {t("followOrder")}
            </a>
          </div>
        </Card>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, reference, offer_name, status, total_da, created_at, entitlements(id, revoked_at, expires_at)",
    )
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as unknown as OrderRow[];

  if (orders.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="font-display text-4xl font-bold uppercase">{t("title")}</h1>
        <p className="mt-3 text-ink-muted">{t("intro")}</p>
        <Card className="mt-8 p-6">
          <h2 className="font-display text-lg font-bold">{t("emptyTitle")}</h2>
          <p className="mt-3 text-ink-muted">{t("emptyText")}</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("title")}</h1>
      <p className="mt-3 text-ink-muted">{t("intro")}</p>

      {await Promise.all(
        orders.map(async (order) => {
          const labelKey = statusLabelKey(order.status);
          const isPaid = order.status === "paid";
          const entitlements = order.entitlements ?? [];

          // Revalidation serveur UNIQUEMENT sur une commande confirmée :
          // un droit révoqué/expiré échoue ici (ou est filtré avant tout
          // appel) et n'ouvre donc aucun lien de téléchargement.
          const rights: RightView[] = isPaid
            ? await Promise.all(
                entitlements.map(async (e) => {
                  const expired =
                    e.expires_at !== null &&
                    new Date(e.expires_at).getTime() <= Date.now();
                  if (e.revoked_at !== null || expired) {
                    return { entitlementId: e.id, inactive: true, files: [] };
                  }
                  const res = await resolveDownloadGrant({
                    userId: auth.userId,
                    entitlementId: e.id,
                  });
                  return res.ok
                    ? { entitlementId: e.id, inactive: false, files: res.grant.files }
                    : { entitlementId: e.id, inactive: false, files: [] };
                }),
              )
            : [];

          const activeFiles = rights.flatMap((r) =>
            r.files.map((f) => ({ entitlementId: r.entitlementId, file: f })),
          );
          const hasInactive = rights.some((r) => r.inactive);

          return (
            <Card key={order.id} className="mt-6 p-6">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold uppercase text-ink-muted">
                  {order.offer_name}
                </span>
                <span className="font-display text-2xl font-bold">{order.reference}</span>
              </div>
              <dl className="mt-4 flex flex-col gap-3">
                <div className="flex flex-row items-baseline justify-between gap-4">
                  <dt className="text-sm font-semibold uppercase text-ink-muted">
                    {ts("statusLabel")}
                  </dt>
                  {/* Statut interne inconnu : libellé neutre « en attente ». */}
                  <dd className="text-lg font-semibold">
                    {labelKey ? ts(labelKey) : ts("pending_payment")}
                  </dd>
                </div>
                <div className="flex flex-row items-baseline justify-between gap-4">
                  <dt className="text-sm font-semibold uppercase text-ink-muted">
                    {ts("amountLabel")}
                  </dt>
                  <dd className="font-display text-lg font-bold">
                    {nf.format(order.total_da)} {ts("currency")}
                  </dd>
                </div>
                <div className="flex flex-row items-baseline justify-between gap-4">
                  <dt className="text-sm font-semibold uppercase text-ink-muted">
                    {ts("dateLabel")}
                  </dt>
                  <dd className="text-sm text-ink-muted">
                    {df.format(new Date(order.created_at))}
                  </dd>
                </div>
              </dl>

              {/* Reçu : UNIQUEMENT sur paiement confirmé (la route exige
                  aussi la session + le statut paid — branche M8). */}
              {isPaid && (
                <div className="mt-5">
                  <a
                    href={`/api/orders/${order.reference}/receipt`}
                    download={`recu-${order.reference}.pdf`}
                    className="inline-block rounded-md border border-ink px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-ink transition-colors duration-base hover:bg-ink hover:text-paper"
                  >
                    {t("receipt")}
                  </a>
                </div>
              )}

              {/* Fichiers : uniquement sur commande confirmée ; un droit
                  révoqué/expiré est signalé NON ACTIF (jamais un lien). */}
              {isPaid && (
                <div className="mt-6 border-t border-line pt-4">
                  <h2 className="font-display text-lg font-bold">{t("filesTitle")}</h2>
                  {activeFiles.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {activeFiles.map(({ entitlementId, file }) => (
                        <li key={`${entitlementId}-${file.id}`}>
                          <a
                            href={`/api/downloads/${entitlementId}?file=${file.id}`}
                            download
                            className="inline-block rounded-md border border-line-input bg-surface-raised px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-ink transition-colors duration-base hover:bg-surface"
                          >
                            {file.label || t("download")}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasInactive && (
                    <p className="mt-3 text-sm text-ink-muted">{t("rightInactive")}</p>
                  )}
                  {activeFiles.length === 0 && !hasInactive && (
                    <p className="mt-3 text-sm text-ink-muted">{t("noFiles")}</p>
                  )}
                </div>
              )}
            </Card>
          );
        }),
      )}
    </main>
  );
}
