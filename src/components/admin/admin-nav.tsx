"use client";

import {
  Archive,
  Ellipsis,
  FileBarChart,
  FileStack,
  History,
  LayoutDashboard,
  Network,
  Settings,
  Shapes,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { cn } from "@/lib/utils";

type Item = { href: string; label: string; tab?: string; icon: typeof Users };

// Shown in the sidebar on large screens, and in the bottom tab bar on phones and tablets
const main: Item[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/certificates", label: "Certificates", tab: "Certs", icon: FileStack },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  { href: "/admin/users", label: "Staff", icon: Users },
];
// In the sidebar too; on phones and tablets they sit behind "More"
const more: Item[] = [
  { href: "/admin/types", label: "Types", icon: Shapes },
  { href: "/admin/trash", label: "Trash", icon: Trash2 },
  { href: "/admin/activity", label: "Activity log", icon: History },
  { href: "/admin/backup", label: "Backup", icon: Archive },
  { href: "/admin/system", label: "System map", icon: Network },
  { href: "/admin/control", label: "Control Center", icon: SlidersHorizontal },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
const sidebar = [main[0]!, main[1]!, main[2]!, more[0]!, main[3]!, ...more.slice(1)];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  // Labs are managed together with the types
  if (href === "/admin/types" && pathname.startsWith("/admin/labs")) return true;
  return pathname.startsWith(href);
}

const tabClass =
  "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium text-muted-foreground aria-[current=page]:text-primary";

/** Sidebar on large screens, bottom tab bar with a "More" menu on phones and tablets. */
export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const menu = React.useRef<HTMLDivElement>(null);
  const moreActive = more.some((i) => isActive(pathname, i.href));

  // The menu closes when a page is picked, on Escape and on a tap outside it
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <>
      <nav aria-label="Admin" className="hidden w-56 shrink-0 lg:block print:hidden">
        <ul className="sticky top-24 grid gap-1">
          {sidebar.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav
        aria-label="Admin"
        data-tabbar
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      >
        <div ref={menu} className="relative mx-auto max-w-lg">
          {open ? (
            <ul
              id="admin-more-menu"
              className="absolute right-2 bottom-full mb-2 grid w-56 max-w-[calc(100vw-1rem)] gap-1 rounded-xl border bg-background p-2 shadow-lg"
            >
              {more.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="grid grid-cols-5">
            {main.map(({ href, label, tab, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={tabClass}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  <span>
                    {tab ?? label}
                    {tab ? <span className="sr-only"> ({label.toLowerCase()})</span> : null}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? "admin-more-menu" : undefined}
                onClick={() => setOpen((v) => !v)}
                className={cn(tabClass, "cursor-pointer", moreActive && "text-primary")}
              >
                <Ellipsis className="size-5" aria-hidden="true" />
                <span>More</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </>
  );
}
