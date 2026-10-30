import { getTranslations } from "next-intl/server";
import { waLink, hasWhatsAppNumber } from "@/lib/whatsapp";

/**
 * Barre WhatsApp fixe en bas, visible uniquement sur mobile. Masquée si le
 * numéro est absent/invalide. Reste au-dessus du contenu sans gêner le défilement.
 */
export async function MobileWhatsAppBar() {
  if (!hasWhatsAppNumber()) return null;
  const t = await getTranslations("whatsapp");
  const href = waLink(t("messages.default"));
  if (!href) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 backdrop-blur md:hidden">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-12 w-full items-center justify-center bg-red-lux px-4 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-bright"
      >
        {t("label")}
      </a>
    </div>
  );
}
