import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/ui/cn";

/** Logotype texte « Teekay » (blanc cassé) + « Fit » (rouge vif), sans littéraux en JSX. */
export async function Brand({ className }: { className?: string }) {
  const t = await getTranslations("brand");
  return (
    <span className={cn("font-display text-xl font-bold uppercase tracking-wide", className)}>
      {t("name")}
      <span className="text-red-bright">{t("accent")}</span>
    </span>
  );
}
