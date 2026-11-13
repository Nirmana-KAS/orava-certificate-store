import "server-only";

import { createHash } from "node:crypto";

import { formatDateTime } from "@/lib/format";
import { site } from "@/lib/site";
import {
  accessBlock,
  blockFor,
  effectiveStates,
  isSectionId,
  scheduleActive,
  scheduleSoon,
  SECTION_BY_ID,
  STATE_LABEL,
  type AccessRow,
  type Block,
  type Capability,
  type EffectiveMap,
  type ScheduleRow,
  type SectionId,
  type SwitchRow,
  type SwitchState,
} from "@/lib/system/switches";

import { audit } from "./audit";
import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import type { ClientInfo } from "./request";

// Switch states are rows in the database. Every staff request checks them through a short
// in-memory copy (10 seconds), so the check is fast. If the database can't be read, the last
// copy is used; with no copy at all, everything counts as on (the admin pages still work).

const CACHE_MS = 10_000;

export type Snapshot = {
  rows: SwitchRow[];
  schedules: (ScheduleRow & { activeSince: string | null })[];
  access: AccessRow[];
  loadedAt: number;
};

let cached: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;

/** The next read goes to the database (after a change on this server). */
export function invalidateSwitches(): void {
  cached = null;
}

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);

async function readAll(): Promise<Snapshot> {
  const sql = db();
  const [rows, schedules, access] = await Promise.all([
    sql<
      {
        section: string;
        state: SwitchState;
        message: string | null;
        until: Date | null;
        include_admin: boolean;
      }[]
    >`select section, state, message, until, include_admin from system_switches`,
    sql<
      {
        id: string;
        section: string;
        state: Exclude<SwitchState, "on">;
        message: string | null;
        kind: ScheduleRow["kind"];
        days: number[];
        start_time: string | null;
        end_time: string | null;
        starts_at: Date | null;
        ends_at: Date | null;
        tz: string;
        enabled: boolean;
        active_since: Date | null;
      }[]
    >`select id::text, section, state, message, kind, days, start_time, end_time, starts_at,
        ends_at, tz, enabled, active_since
      from switch_schedules order by created_at`,
    sql<
      {
        id: string;
        scope: AccessRow["scope"];
        target: string;
        state: AccessRow["state"];
        message: string | null;
        until: Date | null;
      }[]
    >`select id::text, scope, target, state, message, until from access_switches
      where until is null or until > now()`,
  ]);
  return {
    rows: rows
      .filter((r) => isSectionId(r.section))
      .map((r) => ({
        section: r.section as SectionId,
        state: r.state,
        message: r.message,
        until: iso(r.until),
        includeAdmin: r.include_admin,
      })),
    schedules: schedules
      .filter((s) => isSectionId(s.section))
      .map((s) => ({
        id: s.id,
        section: s.section as SectionId,
        state: s.state,
        message: s.message,
        kind: s.kind,
        days: (s.days ?? []).map(Number),
        startTime: s.start_time,
        endTime: s.end_time,
        startsAt: iso(s.starts_at),
        endsAt: iso(s.ends_at),
        tz: s.tz,
        enabled: s.enabled,
        activeSince: iso(s.active_since),
      })),
    access: access.map((a) => ({ ...a, until: iso(a.until) })),
    loadedAt: Date.now(),
  };
}

/** The saved switches, at most 10 seconds old. Never throws. */
export async function loadSwitches(fresh = false): Promise<Snapshot> {
  if (!fresh && cached && Date.now() - cached.loadedAt < CACHE_MS) return cached;
  loading ??= (async () => {
    try {
      // Timers that ran out are switched back on first, then windows that opened or closed
      // are written down
      await settleTimers().catch((e) => console.error("switch timers failed", e));
      const snap = await readAll();
      await settleSchedules(snap.schedules).catch((e) =>
        console.error("switch schedules failed", e),
      );
      cached = snap;
      return cached;
    } catch (error) {
      console.error("switches could not be read", error);
      // Keep the last copy (or "everything on") for another 10 seconds instead of asking the
      // database again on every request while it is having trouble
      cached = cached
        ? { ...cached, loadedAt: Date.now() }
        : { rows: [], schedules: [], access: [], loadedAt: Date.now() };
      return cached;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function currentStates(now = new Date()): Promise<EffectiveMap> {
  const s = await loadSwitches();
  return effectiveStates(s.rows, s.schedules, now);
}

type Who = { role: "admin" | "viewer"; id: string; canUpload: boolean } | null;

/**
 * Whether a request may do this right now. `who` is the signed-in person (null before sign-in);
 * `typeId` the certificate type involved, if any. The admin is never stopped, except for
 * uploads and extraction when the admin chose to include their own.
 */
export async function switchBlock(
  cap: Capability,
  who: Who,
  typeId?: string | null,
): Promise<Block | null> {
  const s = await loadSwitches();
  const now = new Date();
  const eff = effectiveStates(s.rows, s.schedules, now);
  if (who?.role === "admin") return blockFor(cap, eff, { admin: true });
  const blocks = [
    blockFor(cap, eff),
    who ? accessBlock(cap, s.access, { userId: who.id, canUpload: who.canUpload }, now) : null,
    typeId ? accessBlock(cap, s.access, { typeId }, now) : null,
  ].filter((b): b is Block => b !== null);
  const order = { readonly: 1, hold: 2, down: 3 } as const;
  return blocks.sort((a, b) => order[b.state] - order[a.state])[0] ?? null;
}

/** Certificate types switched to Hold or Down for staff: left out of search and reports. */
export async function hiddenTypeIds(who: Who): Promise<string[]> {
  if (!who || who.role === "admin") return [];
  const s = await loadSwitches();
  const now = Date.now();
  return s.access
    .filter(
      (a) =>
        a.scope === "type" &&
        a.state !== "readonly" &&
        (!a.until || new Date(a.until).getTime() > now),
    )
    .map((a) => a.target);
}

/** A staff sign-in stops working while Sign-in (or everything) is Down, or the person is. */
export async function sessionSwitchedOff(who: NonNullable<Who>): Promise<boolean> {
  if (who.role === "admin") return false;
  const b = await switchBlock("signin", who);
  return b?.state === "down";
}

/** Maintenance windows opening within 15 minutes that staff will notice. */
export async function upcomingWindows(): Promise<
  { section: SectionId; state: string; at: string }[]
> {
  const s = await loadSwitches();
  const now = new Date();
  return s.schedules
    .filter((x) => scheduleSoon(x, now))
    .map((x) => ({
      section: x.section,
      state: STATE_LABEL[x.state],
      at: x.kind === "once" && x.startsAt ? formatDateTime(x.startsAt) : `${x.startTime}`,
    }));
}

/** Changes whenever anything a staff page shows about switches changes (for live reloads). */
export async function switchesFingerprint(): Promise<string> {
  const s = await loadSwitches();
  const now = new Date();
  const eff = effectiveStates(s.rows, s.schedules, now);
  const soon = s.schedules.filter((x) => scheduleSoon(x, now)).map((x) => x.id);
  return createHash("sha256")
    .update(JSON.stringify([eff, s.access, soon]))
    .digest("base64url")
    .slice(0, 12);
}

// ── Alerts ────────────────────────────────────────────────────────────────────────

export async function adminAlertAddress(): Promise<string> {
  const [row] = await db()<{ alert_email: string | null }[]>`
    select alert_email from app_settings where id = true
  `;
  return row?.alert_email || env().ADMIN_EMAIL;
}

/** Emails the admin. Never throws: an email problem must not undo a switch. */
export async function alertAdmin(subject: string, lines: string[]): Promise<void> {
  try {
    const siteUrl = env().NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    await sendMail({
      to: await adminAlertAddress(),
      subject: `${site.name}: ${subject}`,
      text: [
        ...lines,
        "",
        siteUrl ? `Control Center: ${siteUrl}/admin/control` : "Open Admin → Control Center.",
        `${site.name} · ${site.company}`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("control alert email failed", error);
  }
}

const SYSTEM_CLIENT: ClientInfo = {
  ip: null,
  userAgent: "Control Center timer",
  country: null,
  path: null,
  meta: {},
};

/**
 * Writes down what changed by itself: a manual switch whose "back on at" time passed is turned
 * on, and a maintenance window that opened or closed is logged. Each is done once (the update
 * only matches one request), then the admin gets an email when something came back on.
 */
export async function settleSwitches(): Promise<void> {
  await settleTimers();
  await settleSchedules((await readAll()).schedules);
  invalidateSwitches();
}

async function settleTimers(): Promise<void> {
  const sql = db();
  const ended = await sql<{ section: string; state: string }[]>`
    with old as (
      select section, state from system_switches
      where state <> 'on' and until is not null and until <= now()
      for update
    )
    update system_switches s set state = 'on', message = null, until = null,
      include_admin = false, reason = 'Timer ended', changed_by = 'timer', changed_at = now()
    from old where s.section = old.section
    returning s.section, old.state
  `;
  for (const e of ended) {
    const name = SECTION_BY_ID[e.section as SectionId]?.name ?? e.section;
    await audit(null, "control.timer_end", SYSTEM_CLIENT, name, {
      changes: [{ section: e.section, from: { state: e.state }, to: { state: "on" } }],
      reason: "Back-on time reached",
    });
    await alertAdmin(`${name} is back on`, [
      `${name} was ${STATE_LABEL[e.state as SwitchState] ?? e.state} and its back-on time has passed, so it is on again.`,
    ]);
  }

  const expired = await sql<{ scope: string; target: string; state: string }[]>`
    delete from access_switches where until is not null and until <= now()
    returning scope, target, state
  `;
  for (const e of expired) {
    await audit(null, "control.access_timer_end", SYSTEM_CLIENT, `${e.scope}: ${e.target}`, {
      access: { scope: e.scope, target: e.target, from: { state: e.state }, to: null },
    });
  }
  if (expired.length) {
    await alertAdmin("access switches back on", [
      `${expired.length} user, group or type switch${expired.length === 1 ? "" : "es"} reached the back-on time and ${expired.length === 1 ? "is" : "are"} on again.`,
    ]);
  }
}

async function settleSchedules(schedules: Snapshot["schedules"]): Promise<void> {
  const sql = db();
  const now = new Date();
  for (const s of schedules) {
    const open = scheduleActive(s, now);
    const name = SECTION_BY_ID[s.section].name;
    if (open && !s.activeSince) {
      const [row] = await sql`
        update switch_schedules set active_since = now()
        where id = ${s.id} and active_since is null returning id
      `;
      if (row) {
        await audit(null, "control.schedule_start", SYSTEM_CLIENT, name, {
          schedule: s.id,
          state: s.state,
        });
      }
    } else if (!open && s.activeSince) {
      const [row] = await sql`
        update switch_schedules set active_since = null
        where id = ${s.id} and active_since is not null returning id
      `;
      if (row) {
        await audit(null, "control.schedule_end", SYSTEM_CLIENT, name, {
          schedule: s.id,
          state: s.state,
        });
        if (s.enabled) {
          await alertAdmin(`${name} is back on after maintenance`, [
            `The maintenance window for ${name} (${STATE_LABEL[s.state]}) has ended, so it is on again.`,
          ]);
        }
      }
    }
  }
}

/** The person for switch checks, from a sign-in (or null before sign-in). */
export function whoOf(
  session: { user: { role: "admin" | "viewer"; id: string; canUpload: boolean } } | null,
): Who {
  return session
    ? { role: session.user.role, id: session.user.id, canUpload: session.user.canUpload }
    : null;
}
