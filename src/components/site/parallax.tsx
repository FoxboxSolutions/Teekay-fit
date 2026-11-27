"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

/**
 * Parallaxe décorative (principe 2) — Framer Motion `useScroll` +
 * `useTransform`, bornée en code.
 *
 * Règles :
 *  - l'élément suivi (la `div` racine) reste statique : la mesure de
 *    défilement ne peut pas boucler sur sa propre transformation ; seul
 *    l'enfant porte le translateY ;
 *  - amplitude maximale de 24 px (12 px de chaque côté par défaut), jamais sur
 *    l'image LCP ;
 *  - aucun style dans le HTML serveur : le déplacement n'est posé qu'après
 *    hydratation, et seulement si l'élément est entièrement sous la ligne de
 *    flottaison au chargement (sinon on verrait un saut au montage) ;
 *  - jamais armé en motion réduite ; `globals.css` neutralise de toute façon
 *    `transform` en motion réduite et sans JavaScript.
 */
export function Parallax({
  children,
  className,
  amplitude = 12,
  ariaHidden = false,
}: {
  children: ReactNode;
  className?: string;
  /** Déplacement total en px (borné à 24). */
  amplitude?: number;
  /** Le contenu est purement décoratif (halo) : masqué aux technologies d'assistance. */
  ariaHidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const bounded = Math.min(Math.abs(amplitude), 24);
  const y = useTransform(scrollYProgress, [0, 1], [bounded, -bounded]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    // Déjà visible au chargement : on n'arme pas (aucun saut après hydratation).
    if (rect.top < window.innerHeight) return;
    setActive(true);
  }, []);

  return (
    <div ref={ref} className={className} aria-hidden={ariaHidden || undefined}>
      <motion.div className="parallax-inner" style={active ? { y } : undefined}>
        {children}
      </motion.div>
    </div>
  );
}
