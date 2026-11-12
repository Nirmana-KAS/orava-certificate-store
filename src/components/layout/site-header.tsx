import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { SubmitButton } from "@/components/forms/submit-button";
import { SystemBell } from "@/components/layout/system-bell";
import { signOutAction } from "@/lib/auth/actions";
import { openIncidents } from "@/lib/server/health";
import { getSession, homeFor } from "@/lib/server/session";
import { formatDateTime } from "@/lib/format";
import { site } from "@/lib/site";
import { COMPONENT_BY_ID } from "@/lib/system/map";

export async function SiteHeader() {
  const session = await getSession();
  const problems =
    session?.user.role === "admin"
      ? (await openIncidents().catch(() => [])).map((i) => ({
          name: COMPONENT_BY_ID[i.component]?.name ?? i.component,
          since: formatDateTime(i.started_at),
          summary: i.summary,
        }))
      : [];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href={session ? homeFor(session.user.role) : "/"}
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

        {session ? (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="hidden max-w-56 truncate text-sm text-muted-foreground md:inline"
              title={session.user.email}
            >
              {session.user.email}
            </span>
            {session.user.role === "admin" ? <SystemBell problems={problems} /> : null}
            <form action={signOutAction}>
              <SubmitButton variant="ghost" size="sm" aria-label="Sign out">
                <LogOut aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
