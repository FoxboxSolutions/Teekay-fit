import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ContentText } from "@/components/site/content-text";
import { Accordion } from "@/components/ui/accordion";

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
  const t = await getTranslations({ locale, namespace: "faq" });
  return { title: t("metaTitle"), description: t("heading") };
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("faq");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("heading")}</h1>
      <div className="mt-8">
        <Accordion
          ariaLabel={t("heading")}
          items={[
            { value: "q1", title: t("i1"), content: <ContentText text={t("a1")} className="text-ink-muted" /> },
            { value: "q2", title: t("i2"), content: <ContentText text={t("a2")} className="text-ink-muted" /> },
            { value: "q3", title: t("i3"), content: <ContentText text={t("a3")} className="text-ink-muted" /> },
            { value: "q4", title: t("i4"), content: <ContentText text={t("a4")} className="text-ink-muted" /> },
          ]}
        />
      </div>
    </main>
  );
}
