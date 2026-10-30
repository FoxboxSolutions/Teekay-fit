import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { MobileWhatsAppBar } from "@/components/site/mobile-whatsapp-bar";

/**
 * Coquille des pages publiques (route group « (public) », sans impact sur l'URL).
 * La page elle-même fournit son <main> (un seul h1/main par page).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
      <MobileWhatsAppBar />
      {/* Espace pour la barre fixe mobile afin de ne pas masquer le bas du contenu. */}
      <div aria-hidden="true" className="h-12 md:hidden" />
    </>
  );
}
