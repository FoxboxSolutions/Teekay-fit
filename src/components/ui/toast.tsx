import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/ui/cn";
import { CloseIcon } from "./icons";

export function ToastProvider({ children }: { children: ReactNode }) {
  return <ToastPrimitive.Provider>{children}</ToastPrimitive.Provider>;
}

export function ToastViewport() {
  return (
    <ToastPrimitive.Viewport className="fixed bottom-4 end-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
  );
}

export interface ToastProps
  extends ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  title: string;
  description?: string;
  closeLabel: string;
}

export function Toast({
  title,
  description,
  closeLabel,
  className,
  ...props
}: ToastProps) {
  return (
    <ToastPrimitive.Root
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-control border border-line bg-surface-raised p-4 shadow-pop",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="mt-1.5 size-2 shrink-0 rounded-full bg-red-bright"
      />
      <div className="flex flex-col gap-1">
        <ToastPrimitive.Title className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
          {title}
        </ToastPrimitive.Title>
        {description ? (
          <ToastPrimitive.Description className="text-sm text-ink-muted">
            {description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      <ToastPrimitive.Close
        aria-label={closeLabel}
        className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text"
      >
        <CloseIcon className="size-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
