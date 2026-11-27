"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * Effet E1 — entrée échelonnée du hero (îlot client minimal).
 *
 * Règle centrale (B2) : les éléments du hero sont rendus par le serveur et
 * VISIBLES (opacité 1 côté SSR, jamais opacity 0) ; l'entrée échelonnée est
 * un simple translateY appliqué depuis le rendu initial, donc aucun contenu
 * critique (titre, baseline, CTA) n'est jamais masqué, y compris sans
 * JavaScript ni avant hydratation (override CSS, cf. globals.css).
 *
 * Le style initial est identique côté serveur et côté client : aucune
 * branche `useReducedMotion()` dans le rendu (elle renvoyait `false`/`null`
 * au SSR et `true` au client sous `prefers-reduced-motion: reduce`, donc
 * un `<div>` nu côté client contre un `motion.div` avec transform au SSR).
 * La motion réduite et le sans-JavaScript sont neutralisés uniquement en
 * CSS (`transform: none !important`, cf. globals.css) — durée, courbe et
 * délai de l'entrée restent inchangés.
 *
 * Le visuel du hero n'est PAS enveloppé ici : c'est l'élément LCP, il reste
 * du HTML serveur pur (aucune hydratation sur le chemin critique du LCP).
 */

/** Courbe du design system (globals.css : --ease-out-strong). */
const EASE_OUT_STRONG: [number, number, number, number] = [0.23, 1, 0.32, 1];
/** Durée du token --duration-slow (320 ms). */
const DURATION_SLOW_S = 0.32;

/** Entrée échelonnée d'un bloc du hero : translateY 14px → 0, opacité constante. */
export function HeroRise({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ y: 14 }}
      animate={{ y: 0 }}
      transition={{ duration: DURATION_SLOW_S, delay, ease: EASE_OUT_STRONG }}
    >
      {children}
    </motion.div>
  );
}
