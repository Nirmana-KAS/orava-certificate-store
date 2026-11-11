import { MapPin } from "lucide-react";

import {
  describeDevice,
  describePlace,
  type ClientMeta,
  type DeviceGeo,
  type GeoStatus,
} from "@/lib/client-info";
import { cn } from "@/lib/utils";

export type Fact = { label: string; value: React.ReactNode };

/** Label and value pairs, one per line: "Browser   Chrome 157". */
export function Facts({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm",
        className,
      )}
    >
      {facts.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className="min-w-0 wrap-anywhere">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A place with a link that opens Google Maps with a pin on it, saying whether it is the
 * device's exact location or only the internet provider's town.
 */
export function PlaceLink({
  ip,
  meta,
  geo,
  status,
  label,
}: {
  ip: string | null;
  meta: ClientMeta | null;
  geo?: DeviceGeo | null;
  status?: GeoStatus;
  /** Says what the place is for screen readers, e.g. "last sign-in of a@b.com" */
  label?: string;
}) {
  const place = describePlace(ip, meta, geo, status);
  const how =
    place.kind === "exact"
      ? `Exact, from the device · ${place.accuracy}`
      : place.kind === "approximate"
        ? `Approximate, from the internet address${place.note ? ` · ${place.note}` : ""}`
        : place.note;
  return (
    <span className="grid">
      {place.mapUrl ? (
        <a
          href={place.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-6 items-start gap-1 text-primary underline-offset-4 hover:underline"
        >
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {place.text}
            <span className="sr-only">{label ? ` (${label})` : ""}, open the map in a new tab</span>
          </span>
        </a>
      ) : (
        <span className="text-muted-foreground">{place.text}</span>
      )}
      {how ? <span className="text-xs text-muted-foreground">{how}</span> : null}
    </span>
  );
}

/** Browser, system, device, place and IP of a request, for the activity log and staff list. */
export function clientFacts(
  ip: string | null,
  userAgent: string | null,
  meta: ClientMeta | null,
  geo?: DeviceGeo | null,
  status?: GeoStatus,
): Fact[] {
  const facts: Fact[] = [];
  if (userAgent) {
    const d = describeDevice(userAgent, meta);
    facts.push(
      { label: "Browser", value: d.browser },
      { label: "System", value: d.system },
      { label: "Device", value: d.device },
    );
  }
  if (geo || ip || meta?.city || meta?.country) {
    facts.push({
      label: "Location",
      value: <PlaceLink ip={ip} meta={meta} geo={geo} status={status} />,
    });
  }
  if (ip) facts.push({ label: "IP address", value: ip });
  return facts;
}
