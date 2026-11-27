import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/redirect-paths";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.confirm" });
  // Page de connexion personnelle : jamais indexée.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * M8 (bloc 0a) — Page de confirmation du lien de connexion.
 *
 * Le GET n'authentifie RIEN : il affiche un bouton « Se connecter » qui
 * soumet le token_hash en POST (route /api/auth/confirm). C'est le POST qui
 * consomme le jeton à usage unique — un scanner de liens de messagerie
 * (préchargement GET) ne peut PAS consommer le lien à la place du client.
 *
 * Jeton absent/tronqué ou erreur (inconnu, expiré, déjà consommé) ⇒ même
 * page neutre « lien expiré » avec marche à suivre (demander un nouveau
 * lien) — aucune distinction observable.
 *
 * `next` : validé ICI côté serveur par `safeNextPath` (liste blanche
 * stricte `/fr/admin` | `/fr/account`) puis recopié dans le champ caché —
 * une valeur refusée ne peut donc jamais atteindre le POST.
 */
export default async function AuthConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.confirm" });

  const sp = await searchParams;
  const rawToken = sp.token_hash;
  const tokenHash = typeof rawToken === "string" ? rawToken : "";
  const error = sp.error === "1";
  const valid = tokenHash.length >= 16 && tokenHash.length <= 512;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);

  return (
    <Card className="mx-auto mt-12 max-w-lg p-8">
      <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
      {error || !valid ? (
        <>
          <p className="mt-4 text-sm text-ink-muted">{t("expired")}</p>
          <p className="mt-4">
            <a
              className="text-sm underline"
              href={`/${locale}/login?next=${encodeURIComponent(next)}`}
            >
              {t("requestNew")}
            </a>
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink-muted">{t("intro")}</p>
          <form method="post" action="/api/auth/confirm" className="mt-6">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value="magiclink" />
            <input type="hidden" name="next" value={next} />
            <Button type="submit">{t("signIn")}</Button>
          </form>
        </>
      )}
    </Card>
  );
}
