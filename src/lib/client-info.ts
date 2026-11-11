// Turns what a browser sends (user agent, client hints) and what the hosting adds (the place of
// the IP address) into short, readable answers: "Chrome 157", "Windows 11", "Colombo, Sri Lanka".
// Used on the server and in the browser (for the backup's Excel file), so it has no imports.

/** Saved with each sign-in and activity entry (audit_logs.client, sessions.client). */
export type ClientMeta = {
  /** Sec-CH-UA-Platform-Version, e.g. "15.0.0" (Windows 11), "14.0.0" (Android 14) */
  platformVersion?: string;
  /** Sec-CH-UA-Model, e.g. "SM-S918B" (phones only) */
  model?: string;
  /** Brands from Sec-CH-UA, e.g. "Brave" (only when it isn't plain Chrome) */
  brand?: string;
  /** From the IP address, given by Vercel: approximate, usually the town of the internet provider */
  city?: string;
  region?: string;
  country?: string;
  lat?: number;
  lon?: number;
};

export type Device = { browser: string; system: string; device: string };

const major = (v: string | undefined) => (v ? Number.parseInt(v, 10) : Number.NaN);

function browserOf(ua: string, meta: ClientMeta): string {
  const m = (re: RegExp) => ua.match(re)?.[1];
  let v: string | undefined;
  if ((v = m(/HeadlessChrome\/(\d+)/))) return `Headless Chrome ${v}`;
  if ((v = m(/EdgA?\/(\d+)/) ?? m(/EdgiOS\/(\d+)/))) return `Edge ${v}`;
  if ((v = m(/OPR\/(\d+)/) ?? m(/OPiOS\/(\d+)/))) return `Opera ${v}`;
  if ((v = m(/SamsungBrowser\/(\d+)/))) return `Samsung Internet ${v}`;
  if ((v = m(/(?:Firefox|FxiOS)\/(\d+)/))) return `Firefox ${v}`;
  if ((v = m(/CriOS\/(\d+)/))) return `Chrome ${v}`;
  if ((v = m(/Chrome\/(\d+)/))) return `${meta.brand || "Chrome"} ${v}`;
  if ((v = m(/Version\/(\d+(?:\.\d+)?).*Safari\//))) return `Safari ${v}`;
  if (/curl\//i.test(ua)) return "curl (a program, not a browser)";
  return ua ? "Other browser" : "Not recorded";
}

function systemOf(ua: string, meta: ClientMeta): string {
  const pv = major(meta.platformVersion);
  const win = ua.match(/Windows NT (\d+\.\d+)/)?.[1];
  if (win) {
    if (win === "10.0") {
      // Windows 11 still says "Windows NT 10.0"; the browser's system version tells them apart
      if (!Number.isNaN(pv)) return pv >= 13 ? "Windows 11" : "Windows 10";
      return "Windows 10 or 11";
    }
    return (
      { "6.3": "Windows 8.1", "6.2": "Windows 8", "6.1": "Windows 7" }[win] ?? `Windows ${win}`
    );
  }
  if (/Android/.test(ua)) {
    if (!Number.isNaN(pv) && pv > 0) return `Android ${pv}`;
    // Chrome hides the real version ("Android 10; K") unless it shares it
    if (/Android 10; K\)/.test(ua)) return "Android";
    const v = ua.match(/Android (\d+(?:\.\d+)?)/)?.[1];
    return v ? `Android ${v}` : "Android";
  }
  const ios = ua.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/);
  if (ios && /iPhone|iPad|iPod/.test(ua)) {
    return `${/iPad/.test(ua) ? "iPadOS" : "iOS"} ${ios[1]}${ios[2] !== "0" ? `.${ios[2]}` : ""}`;
  }
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X/.test(ua)) {
    // Browsers freeze this at 10.15; the shared system version is the real one
    if (!Number.isNaN(pv) && pv > 10) return `macOS ${pv}`;
    return "macOS";
  }
  if (/Linux/.test(ua)) return "Linux";
  return ua ? "Other system" : "Not recorded";
}

function deviceOf(ua: string, meta: ClientMeta): string {
  const model = meta.model?.trim();
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) {
    return model ? `Tablet (${model})` : "Tablet";
  }
  if (/Mobile|iPhone|iPod/.test(ua)) {
    if (/iPhone/.test(ua)) return "iPhone";
    return model ? `Phone (${model})` : "Phone";
  }
  return ua ? "Computer" : "Not recorded";
}

/** Browser, system and device in plain words. */
export function describeDevice(
  userAgent: string | null | undefined,
  meta?: ClientMeta | null,
): Device {
  const ua = userAgent ?? "";
  const m = meta ?? {};
  return { browser: browserOf(ua, m), system: systemOf(ua, m), device: deviceOf(ua, m) };
}

let regionNames: Intl.DisplayNames | null | undefined;
function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Addresses that never reach the internet: this computer or an office network. */
export function isLocalIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const v = ip.replace(/^::ffff:/, "");
  return (
    v === "::1" ||
    v === "localhost" ||
    /^127\./.test(v) ||
    /^10\./.test(v) ||
    /^192\.168\./.test(v) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v) ||
    /^f[cd][0-9a-f]{2}:/i.test(v) ||
    /^fe80:/i.test(v)
  );
}

/** The device's own position (GPS / Wi-Fi), shared by the browser with permission. */
export type DeviceGeo = {
  lat: number;
  lon: number;
  /** Metres: the real spot is within this distance */
  accuracy: number;
  /** Street address, when it could be looked up */
  address?: string;
  at?: string;
};

export type GeoStatus = "exact" | "refused" | "unavailable" | null;

export type Place = {
  /** "Kollupitiya, Colombo 3", "Colombo, Sri Lanka", or why there is no place */
  text: string;
  /** Google Maps with a pin on the place, when it is known */
  mapUrl: string | null;
  known: boolean;
  /** exact: from the device; approximate: from the internet address */
  kind: "exact" | "approximate" | "none";
  /** "Within 20 m" for exact places */
  accuracy?: string;
  /** Why there is no exact place, when the person was asked */
  note?: string;
};

const mapsPin = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const accuracyText = (m: number) =>
  m < 1000
    ? `Within ${Math.max(5, Math.round(m / 5) * 5)} m`
    : `Within ${(m / 1000).toFixed(1)} km`;

/**
 * Where a request came from: the device's exact position when it was shared, otherwise the
 * approximate town of the internet address, with a Google Maps link either way.
 */
export function describePlace(
  ip: string | null | undefined,
  meta?: ClientMeta | null,
  geo?: DeviceGeo | null,
  status?: GeoStatus,
): Place {
  if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
    const coords = `${geo.lat.toFixed(5)},${geo.lon.toFixed(5)}`;
    return {
      text: geo.address || coords,
      mapUrl: mapsPin(coords),
      known: true,
      kind: "exact",
      accuracy: accuracyText(geo.accuracy),
    };
  }
  const note =
    status === "refused"
      ? "Exact location not allowed"
      : status === "unavailable"
        ? "Device couldn't give its location"
        : undefined;
  const approx = approximatePlace(ip, meta);
  return note ? { ...approx, note } : approx;
}

function approximatePlace(ip: string | null | undefined, meta?: ClientMeta | null): Place {
  const m = meta ?? {};
  const parts = [m.city, m.country ? countryName(m.country) : undefined].filter(
    (p): p is string => !!p,
  );
  if (parts.length > 0) {
    const query =
      typeof m.lat === "number" && typeof m.lon === "number"
        ? `${m.lat},${m.lon}`
        : parts.join(", ");
    return { text: parts.join(", "), mapUrl: mapsPin(query), known: true, kind: "approximate" };
  }
  if (isLocalIp(ip)) {
    return { text: "This computer or office network", mapUrl: null, known: false, kind: "none" };
  }
  return { text: "Not recorded", mapUrl: null, known: false, kind: "none" };
}
