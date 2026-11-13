import { Clock } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { getSession } from "@/lib/server/session";
import { currentStates, switchBlock, upcomingWindows, whoOf } from "@/lib/server/switches";
import { SECTION_BY_ID, SECTION_IDS, STATE_LABEL } from "@/lib/system/switches";

/** Maintenance windows starting within 15 minutes, shown to staff ahead of time. */
export async function UpcomingNote() {
  const soon = await upcomingWindows().catch(() => []);
  if (!soon.length) return null;
  return (
    <Alert variant="warning" data-testid="upcoming-note">
      <p className="font-medium">Planned maintenance soon</p>
      <ul className="mt-1 grid gap-0.5">
        {soon.map((w) => (
          <li key={`${w.section}-${w.at}`} className="flex items-start gap-1.5">
            <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {SECTION_BY_ID[w.section].name} goes on {w.state} at {w.at} (in under 15 minutes).
            </span>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

/** For staff pages: planned maintenance, and a note while downloads are read-only. */
export async function StaffSwitchBanner() {
  const session = await getSession();
  if (!session || session.user.role === "admin") return null;
  const readonly = await switchBlock("download", whoOf(session));
  const note = readonly?.state === "readonly" ? readonly : null;
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-2 px-4 pt-4 empty:hidden sm:px-6 lg:px-8">
      <UpcomingNote />
      {note ? (
        <Alert data-testid="readonly-note">
          <p className="font-medium">Read-only for now</p>
          <p>{note.message}</p>
        </Alert>
      ) : null}
    </div>
  );
}

/** For the admin dashboard: which switches are not on, with a link to the Control Center. */
export async function ControlBanner() {
  const states = await currentStates().catch(() => null);
  if (!states) return null;
  const off = SECTION_IDS.filter((id) => states[id].state !== "on");
  if (!off.length) return null;
  return (
    <Alert variant="warning" className="mb-4" data-testid="control-banner">
      <p>
        <span className="font-medium">Switched by you: </span>
        <span>
          {off
            .map((id) => `${SECTION_BY_ID[id].name} (${STATE_LABEL[states[id].state]})`)
            .join(", ")}
        </span>
      </p>
      <p>
        <Link href="/admin/control">Open the Control Center</Link>
      </p>
    </Alert>
  );
}
