/**
 * Photo secondaire de la landing — composant serveur, aucune hydratation,
 * aucun JavaScript client.
 *
 * Le léger zoom-out au défilement est une animation CSS pilotée par
 * `animation-timeline: scroll()`, uniquement dans un `@supports`. Sans prise
 * en charge, en motion réduite ou sans scripting, l'image reste dans son état
 * statique (scale 1, translateY 0) : le contenu est toujours visible.
 *
 * Ce visuel n'est jamais l'élément LCP : le monogramme du hero conserve
 * `fetchPriority="high"` et reste chargé en priorité dans le HTML serveur.
 */
import Image from "next/image";

export function ZoomPhoto({
  alt,
  className,
}: {
  alt: string;
  className?: string;
}) {
  return (
    <div className={className ? `zoom-photo ${className}` : "zoom-photo"}>
      <div className="zoom-photo__inner">
        <picture>
          <source
            type="image/avif"
            srcSet="/images/hero/teekay-in-gym.avif"
          />
          <Image
            src="/images/hero/teekay-in-gym.webp"
            alt={alt}
            width={1200}
            height={788}
            sizes="192px"
            loading="lazy"
            decoding="async"
            className="zoom-photo__image"
          />
        </picture>
      </div>
    </div>
  );
}
