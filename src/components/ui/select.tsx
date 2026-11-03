import * as React from "react";

import { cn } from "@/lib/utils";

/** Native select: opens the phone's own picker, which is the easiest to use on small screens. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "min-h-11 w-full min-w-0 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-base transition-colors focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
