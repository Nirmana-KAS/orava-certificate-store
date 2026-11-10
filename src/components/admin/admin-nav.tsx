"use client";

import { FileBarChart, FileStack, LayoutDashboard, Settings, Shapes, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Item = { href: string; label: string; tab?: string; icon: typeof Users };

const items: Item[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/certificates", label: "Certificates", tab: "Certs", icon: FileStack },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  { href: "/admin/types", label: "Types", icon: Shapes },
  { href: "/admin/users", label: "Staff", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  // Labs are managed together with the types
  if (href === "/admin/types" && pathname.startsWith("/admin/labs")) return true;
  return pathname.startsWith(href);
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
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-6">
          {items.map(({ href, label, tab, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium text-muted-foreground aria-[current=page]:text-primary"
              >
                <Icon className="size-5" aria-hidden="true" />
                <span>
                  {tab ?? label}
                  {tab ? <span className="sr-only"> ({label.toLowerCase()})</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
