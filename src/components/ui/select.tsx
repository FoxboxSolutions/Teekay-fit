import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/ui/cn";
import { ChevronDownIcon } from "./icons";

export interface SelectItem {
  value: string;
  label: string;
}

export interface SelectProps {
  items: SelectItem[];
  placeholder: string;
  label: string;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  className?: string;
}

export function Select({
  items,
  placeholder,
  label,
  value,
  onValueChange,
  disabled,
  name,
  className,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-line-input bg-surface px-3 py-2.5 text-start text-base text-ink transition-colors duration-base",
          "data-[placeholder]:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text disabled:opacity-50",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="size-4 shrink-0 text-ink-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          align="start"
          sideOffset={6}
          className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-line bg-surface-raised shadow-pop"
        >
          <SelectPrimitive.Viewport className="p-1">
            {items.map((item) => (
              <SelectPrimitive.Item
                key={item.value}
                value={item.value}
                className="flex cursor-pointer select-none rounded-xs px-3 py-2 text-sm text-ink outline-none transition-colors duration-fast data-[highlighted]:bg-surface data-[highlighted]:text-red-text data-[state=checked]:font-medium"
              >
                <SelectPrimitive.ItemText>
                  {item.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
