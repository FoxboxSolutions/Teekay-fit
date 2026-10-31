"use client";

import { trackEvent } from "@/lib/telemetry/client";
import { cn } from "@/lib/ui/cn";

type Variant = "primary" | "outline" | "bar";

const variantClasses: Record<Variant, string> = {
  primary: "bg-red-lux text-ink hover:bg-wine focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  outline: "border border-line-input text-ink hover:bg-surface focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  bar: "min-h-12 w-full bg-red-lux px-4 text-ink hover:bg-wine focus-visible:ring-inset",
};

interface WhatsAppLinkProps {
  href: string;
  label: string;
  variant?: Variant;
  className?: string;
  /** Émet l'événement `whatsapp_click` avec l'offre concernée (sans PII). */
  offerSlug?: "starter" | "online" | "in-person";
}

/**
 * Lien WhatsApp (client) : le message est construit côté serveur, ici on se
 * contente d'ouvrir wa.me et d'émettre l'événement produit `whatsapp_click`.
 */
export function WhatsAppLink({ href, label, variant = "primary", className, offerSlug }: WhatsAppLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent("whatsapp_click", offerSlug)}
      className={cn(
        "inline-flex items-center justify-center rounded-control px-5 text-sm font-semibold transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-bright",
        variantClasses[variant],
        className,
      )}
    >
      {label}
    </a>
  );
}
