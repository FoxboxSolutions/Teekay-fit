"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";

/**
 * Reveal au défilement (effet E2) — îlot client Framer Motion.
 *
 * Règle centrale (correction M-landing A6) : le contenu est VISIBLE par
 * défaut dans le HTML serveur (aucun style, aucune classe de masquage SSR).
 * L'état « masqué » n'est appliqué qu'APRÈS le montage, côté client, et
 * UNIQUEMENT si l'élément n'est pas déjà dans le viewport au chargement :
 * un titre, un prix, une offre ou un CTA à l'écran n'est donc jamais
 * invisible, ni au premier rendu (mobile lent), ni dans une capture pleine
 * page, ni à l'impression, ni sans JavaScript.
 *
 * Motion réduite : jamais armé, jamais animé — rendu statique.
 * Propriétés animées : opacity + translateY uniquement (compositeur).
 * One-shot : la révélation ne se rejoue pas au re-défilement (once).
 */

/** Courbe du design system (globals.css : --ease-out-strong). */
const EASE_OUT_STRONG: [number, number, number, number] = [0.23, 1, 0.32, 1];
/** Durée du token --duration-slow (320 ms). */
const DURATION_SLOW_S = 0.32;

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Décalage d'entrée (révélation échelonnée d'un groupe). */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inViewport) setArmed(true);
  }, []);

  // Non armé (SSR, viewport au chargement, motion réduite) : contenu statique
  // visible, aucune API d'animation montée.
  if (!armed) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: DURATION_SLOW_S, delay, ease: EASE_OUT_STRONG }}
    >
      {children}
    </motion.div>
  );
}

/** Durée du principe 3 : 450 ms, une seule fois. */
const DURATION_LINE_S = 0.45;

/**
 * Titre d'accent (principe 3) — une ligne révélée derrière un masque :
 * translateY 100 % → 0 en 450 ms, une seule fois.
 *
 * Même règle d'armement que `Reveal` : le HTML serveur ne porte ni masque ni
 * transformation (le titre est lisible sans JavaScript, avant hydratation et
 * à l'impression) ; l'état masqué n'est armé qu'après le montage, côté client,
 * et seulement si la ligne est hors du viewport au chargement ; jamais en
 * motion réduite (globals.css neutralise aussi transform en dernier recours).
 */
export function RevealLine({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(false);
  // L'intersection est observée sur le MASQUE, pas sur la ligne décalée :
  // l'enfant translaté à 100 % est rogné par `overflow: hidden`, donc il ne
  // « croiserait » jamais le viewport et la révélation ne partirait jamais.
  const inView = useInView(ref, { once: true, amount: 0.6 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inViewport) setArmed(true);
  }, []);

  if (!armed) {
    return (
      <span ref={ref} className="line-mask">
        <span className="line-shift">{children}</span>
      </span>
    );
  }

  return (
    <span ref={ref} className="line-mask">
      <motion.span
        className="line-shift"
        initial={{ y: "100%" }}
        animate={inView ? { y: "0%" } : { y: "100%" }}
        transition={{ duration: DURATION_LINE_S, ease: EASE_OUT_STRONG }}
      >
        {children}
      </motion.span>
    </span>
  );
}
