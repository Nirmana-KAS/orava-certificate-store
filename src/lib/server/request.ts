import "server-only";

import { headers } from "next/headers";

export type ClientInfo = {
  ip: string | null;
  userAgent: string | null;
  country: string | null;
  path: string | null;
};

/** Caller details from the request headers (Vercel sets x-forwarded-for and geo headers). */
export async function clientInfo(): Promise<ClientInfo> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    country: h.get("x-vercel-ip-country") ?? null,
    path: h.get("x-orava-path"),
  };
}
