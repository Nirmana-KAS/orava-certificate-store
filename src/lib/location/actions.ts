"use server";

import { z } from "zod";

import { saveSessionLocation } from "@/lib/server/geo";
import { getSession } from "@/lib/server/session";

const input = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("exact"),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(1_000_000),
  }),
  z.object({ status: z.enum(["refused", "unavailable"]) }),
]);

/** The browser's answer to "where is this device?" for the current sign-in. */
export async function saveLocationAction(raw: unknown): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const v = parsed.data;
  await saveSessionLocation(
    session.id,
    v.status === "exact"
      ? {
          status: "exact",
          geo: {
            lat: Math.round(v.lat * 1e6) / 1e6,
            lon: Math.round(v.lon * 1e6) / 1e6,
            accuracy: Math.round(v.accuracy),
          },
        }
      : { status: v.status },
  );
  return { ok: true };
}
