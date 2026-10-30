import type { ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  ariaLabel: string;
  defaultValue?: string;
  className?: string;
}

export function Tabs({
  items,
  ariaLabel,
  defaultValue,
  className,
}: TabsProps) {
  return (
    <TabsPrimitive.Root
      defaultValue={defaultValue ?? items[0]?.value}
      className={className}
    >
      <TabsPrimitive.List
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            className="flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-ink-muted transition-colors duration-base data-[state=active]:border-red-bright data-[state=active]:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text"
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content
          key={item.value}
          value={item.value}
          className="mt-4 focus-visible:outline-none"
        >
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
