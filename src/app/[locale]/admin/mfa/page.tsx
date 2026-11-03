import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { AdminMfaPanel } from "@/components/admin/mfa-panel";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.mfa" });
  // Console administrateur : jamais indexée.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * M7a — enrôlement + défi MFA (TOTP) pour les administrateurs.
 * Le garde serveur rejoue à chaque requête : sans rôle admin, la page reste
 * neutre (jamais de détail sur des comptes existants) ; avec admin, le
 * panneau gère l'activation et le défi, et l'état aal2 de la session est
 * rellu côté serveur. Les actions de confirmation de paiement (bloc 4)
 * exigent aal2 — cette page est le seul chemin de préparation.
 */
export default async function AdminMfaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.mfa");

  const auth = await getAuthContext();

  if (!auth) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t("notSignedIn")}</p>
        </Card>
      </main>
    );
  }

  if (!auth.isAdmin) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t("notAdmin")}</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
      <AdminMfaPanel alreadyVerified={auth.aal2} />
    </main>
  );
}
