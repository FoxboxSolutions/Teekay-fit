import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/ui/cn";

type BadgeVariant = "red" | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  red: "border-red-bright bg-red-lux text-ink",
  neutral: "border-line bg-surface-raised text-ink-muted",
};

export interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  variant?: BadgeVariant;
}

export function Badge({
  variant = "neutral",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
