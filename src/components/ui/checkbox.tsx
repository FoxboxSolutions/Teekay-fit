import type { ComponentPropsWithoutRef } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cn } from "@/lib/ui/cn";
import { CheckIcon } from "./icons";

export function Checkbox({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-xs border border-line-input bg-surface transition-colors duration-200",
        "data-[state=checked]:border-red-bright data-[state=checked]:bg-red-lux",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-ink">
        <CheckIcon className="size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
