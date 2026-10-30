import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const styles = {
  info: { box: "border-primary/30 bg-accent text-accent-foreground", Icon: Info },
  success: { box: "border-success/30 bg-success/5 text-success", Icon: CircleCheck },
  warning: { box: "border-warning/30 bg-warning/5 text-warning", Icon: TriangleAlert },
  error: { box: "border-destructive/30 bg-destructive/5 text-destructive", Icon: CircleAlert },
} as const;

export function Alert({
  variant = "info",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { variant?: keyof typeof styles }) {
  const { box, Icon } = styles[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", box, className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 [&_a]:underline">{children}</div>
    </div>
  );
}
