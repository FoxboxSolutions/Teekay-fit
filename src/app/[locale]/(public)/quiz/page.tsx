import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { QuizForm } from "@/components/site/quiz-form";

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
  const t = await getTranslations({ locale, namespace: "quiz" });
  return { title: t("metaTitle"), description: t("intro") };
}

/** Quiz « Trouve ton programme » (PRD §7) : recommandation puis contact WhatsApp. */
export default async function QuizPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("quiz");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t("heading")}</h1>
      <p className="mt-4 text-ink-muted">{t("intro")}</p>
      <div className="mt-10">
        <QuizForm />
      </div>
    </main>
  );
}
