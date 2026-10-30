import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Label } from "@radix-ui/react-label";
import { cn } from "@/lib/ui/cn";

export interface FieldProps {
  htmlFor: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  htmlFor,
  label,
  error,
  children,
  className,
}: FieldProps) {
  const errorId = `${htmlFor}-error`;
  const child =
    error && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-invalid": true,
          "aria-describedby": errorId,
        })
      : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </Label>
      {child}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
