import "server-only";

import type { DeviceGeo, GeoStatus } from "@/lib/client-info";
import { site } from "@/lib/site";

import { db } from "./db";
import { env } from "./env";

type Address = Record<string, string | undefined>;

/** "12 Galle Road, Kollupitiya, Colombo" from OpenStreetMap's address parts. */
export function shortAddress(a: Address): string | undefined {
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(" ");
  const area = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district;
  const town = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
  const parts = [a.amenity ?? a.building ?? a.office, street, area, town].filter(
    (p, i, all): p is string => !!p && all.indexOf(p) === i,
  );
  return parts.length ? parts.join(", ").slice(0, 200) : undefined;
}

/**
 * The street address of a position, from OpenStreetMap's free Nominatim service. Once per
 * sign-in, so well inside its fair-use limit (1 request a second). Never throws.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string | undefined> {
  if (env().REVERSE_GEOCODE === "off") return undefined;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "en",
    }).toString();
    const res = await fetch(url, {
      headers: { "User-Agent": `OravaCertificateStore/${site.version}` },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { address?: Address; display_name?: string };
    return (
      (body.address ? shortAddress(body.address) : undefined) ??
      body.display_name?.split(",").slice(0, 3).join(",").trim()
    );
  } catch {
    return undefined;
  }
}

/** Saves what the browser said about this sign-in's location. Asked once per sign-in. */
export async function saveSessionLocation(
  sessionId: string,
  result:
    | { status: "exact"; geo: Omit<DeviceGeo, "address" | "at"> }
    | { status: "refused" | "unavailable" },
): Promise<void> {
  if (result.status !== "exact") {
    // A refusal never replaces a location that was already shared
    await db()`
      update sessions set geo_status = ${result.status}
      where id = ${sessionId} and geo_status is distinct from 'exact'
    `;
    return;
  }
  const address = await reverseGeocode(result.geo.lat, result.geo.lon);
  const geo: DeviceGeo = {
    lat: result.geo.lat,
    lon: result.geo.lon,
    accuracy: result.geo.accuracy,
    ...(address ? { address } : {}),
    at: new Date().toISOString(),
  };
  await db()`
    update sessions set geo = ${db().json(geo)}, geo_status = 'exact' where id = ${sessionId}
  `;
}

export async function sessionGeoStatus(sessionId: string): Promise<GeoStatus> {
  const [row] = await db()<{ geo_status: GeoStatus }[]>`
    select geo_status from sessions where id = ${sessionId}
  `;
  return row?.geo_status ?? null;
}
