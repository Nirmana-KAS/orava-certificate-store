"use client";

import { Bell, CircleCheck, CircleAlert } from "lucide-react";
import Link from "next/link";
import * as React from "react";

type Problem = { name: string; since: string; summary: string };

/** The admin's bell: a count of parts that aren't working, and a short list when tapped. */
export function SystemBell({ problems }: { problems: Problem[] }) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const n = problems.length;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? "system-bell-panel" : undefined}
        aria-label={
          n ? `System: ${n} part${n === 1 ? "" : "s"} not working` : "System: everything works"
        }
        className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        data-testid="system-bell"
      >
        <Bell className="size-5" aria-hidden="true" />
        {n ? (
          <span
            className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white"
            aria-hidden="true"
          >
            {n}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id="system-bell-panel"
          className="absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-background p-3 shadow-lg"
          data-testid="system-bell-panel"
        >
          {n ? (
            <ul className="grid gap-2">
              {problems.map((p) => (
                <li key={p.name} className="flex gap-2 text-sm">
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{p.name} is not working</span>
                    <span className="block text-xs text-muted-foreground">Since {p.since}</span>
                    <span className="block text-xs wrap-anywhere text-muted-foreground">
                      {p.summary}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-success">
              <CircleCheck className="size-4" aria-hidden="true" />
              Everything works.
            </p>
          )}
          <Link
            href="/admin/system"
            onClick={() => setOpen(false)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border text-sm font-medium hover:bg-accent"
          >
            Open the System Map
          </Link>
        </div>
      ) : null}
    </div>
  );
}
