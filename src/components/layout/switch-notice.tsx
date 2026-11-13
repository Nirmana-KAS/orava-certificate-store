import { Ban, Clock, Eye, PauseCircle } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import type { Block } from "@/lib/system/switches";
import { cn } from "@/lib/utils";

const LOOK = {
  hold: {
    title: "Temporarily on hold",
    Icon: PauseCircle,
    box: "border-warning/40 bg-warning/5",
    icon: "text-warning",
  },
  down: {
    title: "Switched off for now",
    Icon: Ban,
    box: "border-destructive/40 bg-destructive/5",
    icon: "text-destructive",
  },
  readonly: {
    title: "Read-only for now",
    Icon: Eye,
    box: "border-primary/30 bg-accent",
    icon: "text-primary",
  },
} as const;

/**
 * What staff see in place of a page (or a part of it) that the admin switched off in the
 * Control Center. The page reloads itself when the switch changes, so nobody has to refresh.
 */
export function SwitchNotice({
  block,
  what,
  compact = false,
  className,
}: {
  block: Block;
  /** "Search", "Downloads", …: what is stopped */
  what?: string;
  compact?: boolean;
  className?: string;
}) {
  const look = LOOK[block.state];
  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border-2 text-left",
        look.box,
        compact
          ? "flex gap-3 p-4"
          : "mx-auto grid max-w-xl justify-items-center gap-3 p-6 text-center sm:p-8",
        className,
      )}
      data-testid="switch-notice"
      data-state={block.state}
    >
      <look.Icon
        className={cn("shrink-0", look.icon, compact ? "mt-0.5 size-5" : "size-10")}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <h2 className={cn("font-semibold", compact ? "text-base" : "text-xl")}>
          {what ? `${what}: ` : ""}
          {look.title}
        </h2>
        <p className="mt-1 text-sm wrap-anywhere whitespace-pre-line">{block.message}</p>
        {block.until ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden="true" />
            Back on at about {formatDateTime(block.until)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** A whole page's worth of notice, centred in the usual page width. */
export function SwitchNoticePage({ block, what }: { block: Block; what?: string }) {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <SwitchNotice block={block} what={what} />
    </div>
  );
}
