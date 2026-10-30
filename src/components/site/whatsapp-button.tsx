import { getTranslations } from "next-intl/server";
import { waLink, hasWhatsAppNumber } from "@/lib/whatsapp";
import { cn } from "@/lib/ui/cn";

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
 * manuel côté utilisateur, aucune affirmation de livraison.
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
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-control px-5 py-3 text-sm font-semibold",
        "transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        variant === "primary" && "bg-red-lux text-ink hover:bg-wine",
        variant === "outline" && "border border-line-input text-ink hover:bg-surface",
        className,
      )}
    >
      {label ?? t("label")}
    </a>
  );
}
