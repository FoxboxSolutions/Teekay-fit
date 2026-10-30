import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CloseIcon } from "./icons";

export interface DialogProps {
  title: string;
  description?: string;
  closeLabel: string;
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Dialog({
  title,
  description,
  closeLabel,
  trigger,
  children,
  open,
  onOpenChange,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 animate-fade-in">
          <DialogPrimitive.Content className="w-full max-w-lg rounded-card border border-line bg-surface p-6 shadow-pop animate-fade-in">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-1 text-sm text-ink-muted">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close
                aria-label={closeLabel}
                className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text"
              >
                <CloseIcon className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="mt-4">{children}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
