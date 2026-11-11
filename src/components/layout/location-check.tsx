import { SessionLocation } from "@/components/layout/session-location";
import { sessionGeoStatus } from "@/lib/server/geo";
import { getSession } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";

/** Asks for the device's location once per sign-in (see SessionLocation). */
export async function LocationCheck() {
  const session = await getSession();
  if (!session) return null;
  const [status, settings] = await Promise.all([sessionGeoStatus(session.id), getSettings()]);
  return (
    <SessionLocation
      status={status}
      required={settings.requireLocation && session.user.role !== "admin"}
    />
  );
}
