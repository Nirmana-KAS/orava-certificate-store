"use client";

import { LoaderCircle } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type Props = React.ComponentProps<typeof Button> & { pendingText?: string; confirm?: string };

/** Submit button that shows progress and can ask for confirmation first. */
export function SubmitButton({
  children,
  pendingText,
  confirm,
  disabled,
  onClick,
  ...props
}: Props) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
