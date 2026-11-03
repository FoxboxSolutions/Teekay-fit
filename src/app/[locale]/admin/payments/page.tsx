import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAuthContext } from "@/lib/auth/session";
import { AdminPaymentsList } from "@/components/admin/payments-list";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.payments" });
  // Console administrateur : jamais indexée.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * M7a — vérification admin des paiements BaridiMob.
 * Garde serveur : admin ET session aal2 (requireAdminAal2 appliqué par les
 * routes API ; ici même exigence pour l'affichage). Sans aal2, aucun
 * paiement n'est affiché — l'admin est renvoyé au défi MFA.
 */
export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.payments");

  const auth = await getAuthContext();
  const blocked = !auth?.isAdmin || !auth.aal2;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-2xl font-bold">{t("listTitle")}</h1>
      <div className="mt-6">
        {blocked ? (
          <div>
            <p className="text-sm text-muted-foreground">{t("mfaRequired")}</p>
            <a className="text-sm underline" href={`/${locale}/admin/mfa`}>
              {t("goMfa")}
            </a>
          </div>
        ) : (
          <AdminPaymentsList />
        )}
      </div>
    </main>
  );
}
