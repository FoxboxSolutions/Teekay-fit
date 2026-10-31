import { getTranslations } from "next-intl/server";
import { waLink, hasWhatsAppNumber } from "@/lib/whatsapp";
import { WhatsAppLink } from "@/components/site/whatsapp-link";

type Variant = "primary" | "outline";

type WhatsAppButtonProps = {
  /** Slug de l'offre pour un message pré-rempli ciblé (optionnel). */
  offerSlug?: "starter" | "online" | "in-person";
  label?: string;
  variant?: Variant;
  className?: string;
};

/**
 * Bouton WhatsApp (canal principal). Masqué si le numéro est absent ou hors
 * format international — jamais de faux numéro. Ouvre wa.me : l'envoi reste
 * manuel côté utilisateur, aucune affirmation de livraison. Le clic émet
 * l'événement produit `whatsapp_click` (sans PII).
 */
export async function WhatsAppButton({
  offerSlug,
  label,
  variant = "primary",
  className,
}: WhatsAppButtonProps) {
  if (!hasWhatsAppNumber()) return null;

  const t = await getTranslations("whatsapp");
  const messages: Record<string, string> = {
    default: t("messages.default"),
    starter: t("messages.starter"),
    online: t("messages.online"),
    "in-person": t("messages.inPerson"),
  };
  const message = messages[offerSlug ?? "default"] ?? t("messages.default");
  const href = waLink(message);
  if (!href) return null;

  return (
    <WhatsAppLink
      href={href}
      label={label ?? t("label")}
      variant={variant}
      className={className}
      offerSlug={offerSlug}
    />
  );
}
