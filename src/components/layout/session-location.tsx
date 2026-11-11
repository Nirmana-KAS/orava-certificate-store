"use client";

import { LoaderCircle, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { GeoStatus } from "@/lib/client-info";
import { saveLocationAction } from "@/lib/location/actions";

type State = GeoStatus | "asking";

/**
 * Asks the browser once per sign-in where the device is (GPS or Wi-Fi, after the person taps
 * "Allow"), so the activity log can show the real place instead of the internet provider's
 * town. When the admin requires it, staff can't use the app until they allow it.
 */
export function SessionLocation({ status, required }: { status: GeoStatus; required: boolean }) {
  const [state, setState] = useState<State>(status);
  const asked = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  const ask = useCallback(() => {
    setState("asking");
    const save = async (r: Parameters<typeof saveLocationAction>[0], next: GeoStatus) => {
      try {
        await saveLocationAction(r);
      } catch {
        // Not saved this time; asked again on the next page
      }
      setState(next);
    };
    if (!("geolocation" in navigator)) {
      void save({ status: "unavailable" }, "unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        void save(
          {
            status: "exact",
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            accuracy: p.coords.accuracy,
          },
          "exact",
        ),
      (e) =>
        void save(
          { status: e.code === e.PERMISSION_DENIED ? "refused" : "unavailable" },
          e.code === e.PERMISSION_DENIED ? "refused" : "unavailable",
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (status === null && !asked.current) {
      asked.current = true;
      ask();
    }
  }, [status, ask]);

  const blocked = required && state !== "exact";
  useEffect(() => {
    if (blocked && state !== "asking") button.current?.focus();
  }, [blocked, state]);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-title"
        aria-describedby="location-text"
        className="grid w-full max-w-md gap-4 rounded-xl border bg-background p-6 shadow-lg"
      >
        <h2 id="location-title" className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="size-5 text-primary" aria-hidden="true" />
          Share your location to continue
        </h2>
        <div id="location-text" className="grid gap-2 text-sm text-muted-foreground">
          <p>
            Orava records where each sign-in comes from. Your browser asks once; tap{" "}
            <strong className="text-foreground">Allow</strong>.
          </p>
          {state === "refused" ? (
            <p role="alert" className="text-foreground">
              Location is blocked for this site. Open the site settings (the icon left of the web
              address), set <strong>Location</strong> to <strong>Allow</strong>, then press Try
              again.
            </p>
          ) : state === "unavailable" ? (
            <p role="alert" className="text-foreground">
              This device couldn&apos;t find its location. Turn on Location (or Wi-Fi) in the device
              settings, then press Try again.
            </p>
          ) : null}
        </div>
        <Button ref={button} onClick={ask} disabled={state === "asking"} size="lg">
          {state === "asking" ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <MapPin aria-hidden="true" />
          )}
          {state === "asking" ? "Finding your location…" : state ? "Try again" : "Allow location"}
        </Button>
      </div>
    </div>
  );
}
