import { buildId, copyright, site } from "@/lib/site";

export function SiteFooter() {
  const build = buildId();

  return (
    <footer className="mt-auto border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-1 px-4 py-5 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:gap-4 sm:px-6 sm:text-left lg:px-8">
        <p>{copyright()} All rights reserved.</p>
        <p className="flex flex-wrap items-center justify-center gap-x-2">
          <span>Developed by {site.developer}</span>
          <span aria-hidden="true">·</span>
          <span>
            v{site.version}
            {build ? <span className="font-mono"> ({build})</span> : null}
          </span>
        </p>
      </div>
    </footer>
  );
}
