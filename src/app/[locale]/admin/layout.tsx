import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Coquille des pages /admin (M9a).
 * - metadata : console jamais indexee (robots noindex ; l'en-tête
 *   X-Robots-Tag / Cache-Control est ajoute par next.config.ts sur
 *   /:locale/admin/*).
 * - mobile-first : conteneur large base + sm/lg, pas de texte en dur
 *   (next-intl, namespace admin.dashboard), CSS logiques.
 * - chaque page enfant garde elle-même l'acces (requireAdminAal2 :
 *   redirect vers ./mfa sans authentification / second facteur manquant /
 *   session expiree ; affichage neutre sans etre admin) rejoue a chaque
 *   requete, jamais les donnees.
 */
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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
