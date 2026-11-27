import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/auth/redirect-paths";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  // Page de connexion personnelle : jamais indexée.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Page de connexion par lien magique (Option A).
 *
 * `next` vient de l'URL mais n'est JAMAIS utilisé tel quel : `safeNextPath`
 * le compare à la liste blanche stricte (`/fr/admin` | `/fr/account`).
 * Le formulaire transmet la valeur validée au POST /api/auth/magic-link,
 * qui la revalide de son côté (défense en profondeur).
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.login");

  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
      <h1 className="font-display text-3xl font-bold uppercase">{t("title")}</h1>
      <p className="mt-3 text-sm text-ink-muted">{t("intro")}</p>
      <LoginForm next={next} />
    </main>
  );
}
