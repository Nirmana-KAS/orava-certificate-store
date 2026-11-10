import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A lab's logo in a white box of fixed height, so wide (AIGS) and square (Bellerophon) logos line
 * up. Without a logo, a plain icon.
 */
export function LabLogo({
  src,
  name,
  size = "md",
  className,
}: {
  src: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "h-8 w-14", md: "h-11 w-20", lg: "h-20 w-36" }[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-1",
        box,
        className,
      )}
    >
      {src ? (
        // A small stored image served from this site; next/image adds nothing here
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
      ) : (
        <FlaskConical className="size-5 text-muted-foreground" aria-label={`${name} (no logo)`} />
      )}
    </span>
  );
}
