import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ContentText } from "@/components/site/content-text";

export const revalidate = 60;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("metaTitle"), description: t("bioShort") };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("heading")}</h1>
      <p className="mt-6 text-2xl font-display text-ink">
        <ContentText text={t("name")} />
      </p>

      <section className="mt-8">
        <p className="text-ink-muted">
          <ContentText text={t("bioShort")} />
        </p>
        <p className="mt-4 text-ink-muted">
          <ContentText text={t("bioLong")} />
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold uppercase">{t("qualificationsTitle")}</h2>
        <p className="mt-3 text-ink-muted">
          <ContentText text={t("qualifications")} />
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold uppercase">{t("experienceTitle")}</h2>
        <p className="mt-3 text-ink-muted">
          <ContentText text={t("experience")} />
        </p>
      </section>

      <section className="mt-10">
        <div className="relative aspect-video w-full overflow-hidden rounded-card border border-line bg-surface">
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <ContentText text={t("photoAlt")} className="text-sm" />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold uppercase">{t("socialsTitle")}</h2>
        <p className="mt-3 text-ink-muted">
          <ContentText text={t("socials")} />
        </p>
      </section>
    </main>
  );
}
