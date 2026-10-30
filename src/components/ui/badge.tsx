import * as React from "react";

import { cn } from "@/lib/utils";

const variants = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
} as const;

export function Badge({
  variant = "default",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
