import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  /** Replaces the default input (e.g. a password input with a show button) */
  control?: (props: React.ComponentProps<typeof Input>) => React.ReactNode;
};

/** Label + input + hint + error, wired up with aria attributes for screen readers. */
export function Field({
  label,
  name,
  error,
  hint,
  icon,
  control,
  className,
  id,
  ...props
}: FieldProps) {
  const inputId = id ?? name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const inputProps = {
    id: inputId,
    name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    className: cn(icon && "pl-9", className),
    ...props,
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        {control ? control(inputProps) : <Input {...inputProps} />}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
