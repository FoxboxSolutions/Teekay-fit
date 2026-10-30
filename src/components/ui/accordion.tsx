import type { ReactNode } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@/lib/ui/cn";
import { ChevronDownIcon } from "./icons";

export interface AccordionItemData {
  value: string;
  title: string;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItemData[];
  ariaLabel: string;
  className?: string;
}

export function Accordion({ items, ariaLabel, className }: AccordionProps) {
  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      aria-label={ariaLabel}
      className={cn(
        "overflow-hidden rounded-card border border-line bg-surface",
        className,
      )}
    >
      {items.map((item) => (
        <AccordionPrimitive.Item
          key={item.value}
          value={item.value}
          className="border-t border-line first:border-t-0"
        >
          <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start font-display text-sm font-semibold uppercase tracking-wide text-ink transition-colors duration-base hover:text-red-text data-[state=open]:text-red-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text">
              {item.title}
              <ChevronDownIcon className="size-4 shrink-0 text-ink-muted transition-transform duration-base group-data-[state=open]:rotate-180" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden px-4 pb-4 text-sm text-ink-muted data-[state=open]:animate-fade-in">
            {item.content}
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
