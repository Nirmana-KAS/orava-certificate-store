import Link from "next/link";

import { cn } from "@/lib/utils";

/** "All activity" and "Sign-in sessions": two views of the same log. */
export function ActivityTabs({ current }: { current: "all" | "sessions" }) {
  const tabs = [
    { key: "all", href: "/admin/activity", label: "All activity" },
    { key: "sessions", href: "/admin/activity/sessions", label: "Sign-in sessions" },
  ] as const;
  return (
    <nav aria-label="Activity views" className="mb-4 flex gap-2 overflow-x-auto">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
            current === t.key
              ? "border-primary bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
