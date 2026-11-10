"use client";

import { FilePlus2, LayoutList, ScanText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/upload", label: "Upload home", icon: LayoutList },
  { href: "/upload/import", label: "Add from files", icon: ScanText },
  { href: "/upload/certificates/new", label: "Add by hand", icon: FilePlus2 },
] as const;

/** Links inside upload mode. Wraps onto two lines on small phones. */
export function UploadNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Upload mode" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/upload" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  "aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
