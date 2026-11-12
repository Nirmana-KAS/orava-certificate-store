import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "./env";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Vercel Cron sends "Authorization: Bearer <secret>"; cron-job.org can send x-cron-secret. */
export function cronAuthorized(headers: Headers): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  return (
    same(headers.get("authorization") ?? "", `Bearer ${secret}`) ||
    same(headers.get("x-cron-secret") ?? "", secret)
  );
}

/** This site's address, as the request reached it (or the configured one). */
export function siteOrigin(headers: Headers): string | null {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto =
      headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  const url = env().NEXT_PUBLIC_SITE_URL;
  return url ? url.replace(/\/$/, "") : null;
}
