import { cn } from "@/lib/ui/cn";
import { isPlaceholderText } from "@/lib/content";

type ContentTextProps = {
  text: string;
  className?: string;
};

/**
 * Affiche un texte éditorial. S'il contient le marqueur [À FOURNIR …], un
 * cadre distinct est appliqué en dev/préprod (NEXT_PUBLIC_PLACEHOLDER_FRAMES
 * ou NODE_ENV !== "production") pour repérer visuellement le contenu à fournir.
 * En production le build strict interdit les placeholders, donc pas de cadre.
 */
export function ContentText({ text, className }: ContentTextProps) {
  const placeholder = isPlaceholderText(text);
  const frames =
    process.env.NEXT_PUBLIC_PLACEHOLDER_FRAMES === "true" ||
    process.env.NODE_ENV !== "production";

  if (placeholder && frames) {
    return (
      <span
        data-placeholder="true"
        className={cn(
          "inline-block rounded-control border border-dashed border-red-bright bg-surface px-2 py-1",
          "align-baseline text-ink-muted",
          className,
        )}
      >
        {text}
      </span>
    );
  }

  return <span className={className}>{text}</span>;
}
