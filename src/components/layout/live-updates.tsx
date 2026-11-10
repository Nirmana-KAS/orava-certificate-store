"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const EVERY_MS = 15_000;

/**
 * Keeps an open page up to date: every 15 seconds while the tab is visible (and straight away
 * when it comes back into view) it asks the server whether anything changed, and if so reloads
 * the page's data in place. Typed text and open panels stay as they are. When the sign-in has
 * ended (signed out by the admin, disabled, passkey changed) it goes to the sign-in page.
 */
export function LiveUpdates({ signInPath = "/" }: { signInPath?: string }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let busy = false;

    async function check() {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (res.status === 401) {
          window.location.assign(signInPath);
          return;
        }
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version) return;
        if (last.current !== null && last.current !== version) router.refresh();
        last.current = version;
      } catch {
        // Offline for a moment: try again next time
      } finally {
        busy = false;
      }
    }

    void check();
    const timer = window.setInterval(check, EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router, signInPath]);

  return null;
}
