import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ContentText } from "@/components/site/content-text";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { DISCIPLINES } from "@/lib/site/nav-data";

export const revalidate = 60;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    DISCIPLINES.map((d) => ({ locale, slug: d.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const disc = DISCIPLINES.find((d) => d.slug === slug);
  if (!disc) return {};
  const t = await getTranslations({ locale, namespace: "disciplines" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const name = tn(`disciplinesList.${disc.key}`);
  return { title: t("metaTitle", { name }), description: t("intro", { name }) };
}

export default async function DisciplinePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const disc = DISCIPLINES.find((d) => d.slug === slug);
  if (!disc) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("disciplines");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("coaching");
  const name = tn(`disciplinesList.${disc.key}`);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{name}</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        <ContentText text={t("intro", { name })} />
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/coaching"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-red-lux px-5 py-3 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {tc("heading")}
        </Link>
        <WhatsAppButton />
      </div>
    </main>
  );
}
