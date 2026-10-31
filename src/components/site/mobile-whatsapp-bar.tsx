import { getTranslations } from "next-intl/server";
import { waLink, hasWhatsAppNumber } from "@/lib/whatsapp";
import { WhatsAppLink } from "@/components/site/whatsapp-link";

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
      <WhatsAppLink href={href} label={t("label")} variant="bar" />
    </div>
  );
}
