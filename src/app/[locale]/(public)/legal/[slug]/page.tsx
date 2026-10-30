import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ContentText } from "@/components/site/content-text";

export const revalidate = 60;

const LEGAL_SLUGS = ["privacy", "terms", "refunds"] as const;
type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    LEGAL_SLUGS.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!LEGAL_SLUGS.includes(slug as LegalSlug)) return {};
  const t = await getTranslations({ locale, namespace: `legal.${slug}` });
  return { title: t("metaTitle"), description: t("heading") };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!LEGAL_SLUGS.includes(slug as LegalSlug)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations(`legal.${slug}`);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("heading")}</h1>
      <p className="mt-8 text-ink-muted">
        <ContentText text={t("body")} />
      </p>
    </main>
  );
}
