import "server-only";

import { headers } from "next/headers";

import type { ClientMeta } from "@/lib/client-info";

export type ClientInfo = {
  ip: string | null;
  userAgent: string | null;
  country: string | null;
  path: string | null;
  /** Place (from Vercel) and system version / model (from the browser), saved with the entry */
  meta: ClientMeta;
};

const clean = (v: string | null | undefined, max = 80) => {
  const s = v
    ?.replace(/^"|"$/g, "")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
  return s ? s.slice(0, max) : undefined;
};

const coordinate = (v: string | null, limit: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1e4) / 1e4 : undefined;
};

function decode(v: string | null): string | undefined {
  if (!v) return undefined;
  try {
    return clean(decodeURIComponent(v));
  } catch {
    return clean(v);
  }
}

/** The brand when it isn't plain Chrome, e.g. "Brave" (from Sec-CH-UA). */
function brandOf(h: string | null): string | undefined {
  if (!h) return undefined;
  const names = [...h.matchAll(/"([^"]+)";v="/g)].map((m) => m[1]!);
  return names.find((n) => /^(Brave|Opera|Vivaldi|Yandex)/i.test(n));
}

/** Caller details from the request headers (Vercel sets x-forwarded-for and the place headers). */
export async function clientInfo(): Promise<ClientInfo> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const meta: ClientMeta = {
    platformVersion: clean(h.get("sec-ch-ua-platform-version"), 20),
    model: clean(h.get("sec-ch-ua-model"), 40),
    brand: brandOf(h.get("sec-ch-ua")),
    city: decode(h.get("x-vercel-ip-city")),
    region: clean(h.get("x-vercel-ip-country-region"), 10),
    country: clean(h.get("x-vercel-ip-country"), 2),
    lat: coordinate(h.get("x-vercel-ip-latitude"), 90),
    lon: coordinate(h.get("x-vercel-ip-longitude"), 180),
  };
  for (const k of Object.keys(meta) as (keyof ClientMeta)[]) {
    if (meta[k] === undefined) delete meta[k];
  }
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    country: h.get("x-vercel-ip-country") ?? null,
    path: h.get("x-orava-path"),
    meta,
  };
}
