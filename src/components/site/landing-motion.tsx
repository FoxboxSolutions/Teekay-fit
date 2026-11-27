/**
 * Bande de disciplines de la landing : composant serveur, aucune hydratation,
 * aucun JavaScript. Le défilement est une boucle CSS (pas un effet lié au
 * scroll) et possède un état statique de repli en motion réduite / sans script.
 */

import { getTranslations } from "next-intl/server";
import { DISCIPLINES } from "@/lib/site/nav-data";

export async function DisciplineMarquee() {
  const tn = await getTranslations("nav");
  const labels = DISCIPLINES.map((d) => tn(`disciplinesList.${d.key}`));

  const group = (duplicate: boolean) => (
    <ul className="marquee__group" aria-hidden={duplicate ? "true" : undefined}>
      {labels.map((label, index) => (
        <li key={`${duplicate ? "copy" : "real"}-${index}`}>{label}</li>
      ))}
    </ul>
  );

  return (
    <section className="marquee-section border-b border-line bg-surface" aria-label={tn("disciplines")}>
      <div className="marquee marquee--forward">
        <div className="marquee__track">
          {group(false)}
          {group(true)}
        </div>
      </div>
      <div className="marquee marquee--reverse">
        <div className="marquee__track">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </section>
  );
}
