"use client";

import { LayoutDashboard, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Staff", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

/** Sidebar on large screens, bottom tab bar on phones and tablets. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Admin" className="hidden w-56 shrink-0 lg:block">
        <ul className="sticky top-24 grid gap-1">
          {items.map(({ href, label, icon: Icon }) => (
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
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {items.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground aria-[current=page]:text-primary"
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
