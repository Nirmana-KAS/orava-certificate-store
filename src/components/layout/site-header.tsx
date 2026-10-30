import Image from "next/image";
import Link from "next/link";

import { site } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-h-11 min-w-0 items-center gap-3 rounded-md"
          aria-label={`${site.name} home`}
        >
          <Image
            src="/brand/orava-logo.png"
            alt=""
            width={1138}
            height={371}
            priority
            className="h-8 w-auto shrink-0 sm:h-9"
          />
          <span className="hidden truncate border-l pl-3 text-sm font-semibold text-foreground min-[400px]:inline sm:text-base">
            Certificate Store
          </span>
        </Link>
      </div>
    </header>
  );
}
