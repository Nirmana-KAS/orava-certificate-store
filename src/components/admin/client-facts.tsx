import { MapPin } from "lucide-react";

import { describeDevice, describePlace, type ClientMeta } from "@/lib/client-info";
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

/** A place with a link that opens Google Maps with a pin on it. */
export function PlaceLink({
  ip,
  meta,
  label,
}: {
  ip: string | null;
  meta: ClientMeta | null;
  /** Says what the place is for screen readers, e.g. "last sign-in of a@b.com" */
  label?: string;
}) {
  const place = describePlace(ip, meta);
  if (!place.mapUrl) return <span className="text-muted-foreground">{place.text}</span>;
  return (
    <a
      href={place.mapUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-6 items-center gap-1 text-primary underline-offset-4 hover:underline"
    >
      <MapPin className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {place.text}
        <span className="sr-only">{label ? ` (${label})` : ""}, open the map in a new tab</span>
      </span>
    </a>
  );
}

/** Browser, system, device, place and IP of a request, for the activity log and staff list. */
export function clientFacts(
  ip: string | null,
  userAgent: string | null,
  meta: ClientMeta | null,
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
  if (ip || meta?.city || meta?.country) {
    facts.push({ label: "Location", value: <PlaceLink ip={ip} meta={meta} /> });
  }
  if (ip) facts.push({ label: "IP address", value: ip });
  return facts;
}
