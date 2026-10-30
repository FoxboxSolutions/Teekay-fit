import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/ui/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-red-bright bg-red-lux text-ink hover:bg-wine",
  secondary:
    "border-line-input bg-surface-raised text-ink hover:bg-surface",
  ghost: "border-transparent bg-transparent text-ink hover:bg-surface-raised",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-1.5 text-xs",
  md: "min-h-11 px-5 py-2.5 text-sm",
};

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  className,
  type,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const typeProps = asChild ? {} : { type: type ?? "button" };

  return (
    <Comp
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border font-display font-semibold uppercase tracking-wide transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...typeProps}
      {...props}
    >
      {children}
    </Comp>
  );
}
