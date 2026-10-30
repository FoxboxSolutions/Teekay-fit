import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/ui/cn";

const textareaClasses =
  "min-h-28 w-full resize-y rounded-control border border-line-input bg-surface px-3 py-2.5 text-base text-ink transition-colors duration-200 placeholder:text-ink-muted disabled:opacity-50 aria-invalid:border-red-bright";

export function Textarea({
  className,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn(textareaClasses, className)} {...props} />;
}
