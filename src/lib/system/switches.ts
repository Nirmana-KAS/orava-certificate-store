// The Control Center's switch rules. Plain data and functions, safe for both the server and the
// browser, so the page, the staff pages and the tests all agree on what each switch does.

export type SwitchState = "on" | "readonly" | "hold" | "down";

export type SectionId =
  | "system"
  | "auth"
  | "public"
  | "database"
  | "storage"
  | "search"
  | "view"
  | "downloads"
  | "uploads"
  | "extraction"
  | "email"
  | "health";

/** What a staff request is trying to do. Each one goes through one section. */
export type Capability =
  "signin" | "public" | "search" | "view" | "download" | "upload" | "extract" | "email" | "health";

export type Section = {
  id: SectionId;
  name: string;
  about: string;
  /** The states the admin can pick for it */
  states: readonly SwitchState[];
  /** Sections it can't work without */
  needs: readonly SectionId[];
  /** May also stop the admin's own use (uploads only); everything else never touches admin */
  adminOption?: boolean;
};

const ALL: readonly SwitchState[] = ["on", "readonly", "hold", "down"];
const NO_RO: readonly SwitchState[] = ["on", "hold", "down"];

export const SECTIONS: readonly Section[] = [
  {
    id: "system",
    name: "Whole staff side",
    about:
      "Everything staff use: sign-in, search, viewing, downloads and uploads. The admin dashboard always keeps working.",
    states: ALL,
    needs: [],
  },
  {
    id: "public",
    name: "Public pages",
    about: "The staff sign-in page and the code page, before anyone is signed in.",
    states: NO_RO,
    needs: [],
  },
  {
    id: "auth",
    name: "Sign-in",
    about:
      "Staff signing in with email and passkey. Hold stops new sign-ins; Down also signs every staff member out.",
    states: NO_RO,
    needs: ["database"],
  },
  {
    id: "search",
    name: "Search",
    about: "The certificate list, filters and reports.",
    states: NO_RO,
    needs: ["database"],
  },
  {
    id: "view",
    name: "Certificate view",
    about: "Opening a certificate and previewing its file.",
    states: NO_RO,
    needs: ["database", "storage"],
  },
  {
    id: "database",
    name: "Database",
    about:
      "Stops the app using the database for staff. It doesn't pause Supabase itself. Read-only keeps search and view, and stops downloads and uploads.",
    states: ALL,
    needs: [],
  },
  {
    id: "storage",
    name: "File storage",
    about: "The private file bucket. Read-only keeps previews, and stops downloads and uploads.",
    states: ALL,
    needs: [],
  },
  {
    id: "downloads",
    name: "Downloads",
    about: "Saving certificate files and report files.",
    states: NO_RO,
    needs: ["view", "storage"],
  },
  {
    id: "uploads",
    name: "Uploads",
    about:
      "Uploaders adding and changing certificates. You can choose to stop your own uploads too.",
    states: NO_RO,
    needs: ["database", "storage"],
    adminOption: true,
  },
  {
    id: "extraction",
    name: "Extraction (OCR)",
    about:
      "Reading certificate files automatically on the import page. Adding one by hand still works.",
    states: NO_RO,
    needs: ["uploads"],
    adminOption: true,
  },
  {
    id: "email",
    name: "Email",
    about: "Emails to staff, such as sign-in codes. Alerts to you, the admin, are always sent.",
    states: NO_RO,
    needs: [],
  },
  {
    id: "health",
    name: "Health checks",
    about: "The automatic System Map checks every 5 minutes. Checks you start yourself still run.",
    states: NO_RO,
    needs: [],
  },
];

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<
  SectionId,
  Section
>;
export const SECTION_IDS = SECTIONS.map((s) => s.id);

export const isSectionId = (v: unknown): v is SectionId =>
  typeof v === "string" && v in SECTION_BY_ID;

/** Sections the whole-system switch covers (staff-facing ones; not email or health checks). */
const UNDER_SYSTEM: ReadonlySet<SectionId> = new Set([
  "public",
  "auth",
  "search",
  "view",
  "downloads",
  "uploads",
  "extraction",
]);

export const CAPABILITY_SECTION: Record<Capability, SectionId> = {
  signin: "auth",
  public: "public",
  search: "search",
  view: "view",
  download: "downloads",
  upload: "uploads",
  extract: "extraction",
  email: "email",
  health: "health",
};

/** Read-only stops these and nothing else. */
export const WRITE_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "download",
  "upload",
  "extract",
]);

export const STATE_LABEL: Record<SwitchState, string> = {
  on: "On",
  readonly: "Read-only",
  hold: "Hold",
  down: "Down",
};

export const SEVERITY: Record<SwitchState, number> = { on: 0, readonly: 1, hold: 2, down: 3 };

export const worst = (a: SwitchState, b: SwitchState): SwitchState =>
  SEVERITY[b] > SEVERITY[a] ? b : a;

export const DEFAULT_MESSAGE: Record<Exclude<SwitchState, "on">, string> = {
  readonly: "Downloads and uploads are paused for a short while. You can still search and view.",
  hold: "This is on hold for a short while. Nothing is lost. Please try again soon.",
  down: "This is switched off by the admin right now.",
};

// ── Saved rows ────────────────────────────────────────────────────────────────────

export type SwitchRow = {
  section: SectionId;
  state: SwitchState;
  message: string | null;
  /** Turns itself back on at this time (ISO), or null */
  until: string | null;
  includeAdmin: boolean;
};

export type ScheduleKind = "once" | "daily" | "weekly";

export type ScheduleRow = {
  id: string;
  section: SectionId;
  state: Exclude<SwitchState, "on">;
  message: string | null;
  kind: ScheduleKind;
  /** Weekly: 0 = Sunday … 6 = Saturday */
  days: number[];
  /** "HH:MM" in tz, for daily and weekly */
  startTime: string | null;
  endTime: string | null;
  /** ISO, for once */
  startsAt: string | null;
  endsAt: string | null;
  tz: string;
  enabled: boolean;
};

export type AccessScope = "user" | "group" | "type";
export type AccessGroup = "uploaders" | "viewers";

export type AccessRow = {
  id: string;
  scope: AccessScope;
  target: string;
  state: Exclude<SwitchState, "on">;
  message: string | null;
  until: string | null;
};

export const GROUP_LABEL: Record<AccessGroup, string> = {
  uploaders: "Uploaders",
  viewers: "Staff who can't upload",
};

// ── Time ──────────────────────────────────────────────────────────────────────────

const toMinutes = (hhmm: string | null): number | null => {
  const m = hhmm?.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 1440 ? v : null;
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday and minute of the day at `at` in the time zone. */
export function localClock(at: Date, tz: string): { day: number; minute: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return localClock(at, "UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    day: WEEKDAY[get("weekday")] ?? 0,
    minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

/** Whether a maintenance window is open at `at`. */
export function scheduleActive(s: ScheduleRow, at: Date): boolean {
  if (!s.enabled) return false;
  if (s.kind === "once") {
    if (!s.startsAt || !s.endsAt) return false;
    const t = at.getTime();
    return t >= new Date(s.startsAt).getTime() && t < new Date(s.endsAt).getTime();
  }
  const start = toMinutes(s.startTime);
  const end = toMinutes(s.endTime);
  if (start === null || end === null || start === end) return false;
  const { day, minute } = localClock(at, s.tz);
  const days = s.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6] : s.days;
  if (start < end) return days.includes(day) && minute >= start && minute < end;
  // Crosses midnight: the part after midnight belongs to the day before
  if (minute >= start) return days.includes(day);
  return minute < end && days.includes((day + 6) % 7);
}

/** Opens within the next `minutes` (and isn't open yet): for the staff warning banner. */
export function scheduleSoon(s: ScheduleRow, at: Date, minutes = 15): boolean {
  if (scheduleActive(s, at)) return false;
  for (let m = 1; m <= minutes; m++) {
    if (scheduleActive(s, new Date(at.getTime() + m * 60_000))) return true;
  }
  return false;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeSchedule(s: ScheduleRow, format: (iso: string) => string): string {
  if (s.kind === "once") {
    return `${s.startsAt ? format(s.startsAt) : "?"} to ${s.endsAt ? format(s.endsAt) : "?"}`;
  }
  const when =
    s.kind === "daily"
      ? "Every day"
      : s.days.length === 0
        ? "No days picked"
        : `Every ${[...s.days]
            .sort()
            .map((d) => DAY_NAMES[d])
            .join(", ")}`;
  return `${when}, ${s.startTime}–${s.endTime} (${s.tz})`;
}

// ── What is in force ──────────────────────────────────────────────────────────────

export type Effective = {
  state: SwitchState;
  message: string | null;
  until: string | null;
  includeAdmin: boolean;
  /** "manual" switch, or the schedule that set it */
  source: "manual" | "schedule";
  scheduleId?: string;
};

export type EffectiveMap = Record<SectionId, Effective>;

/** Each section's state right now: the manual switch (unless its timer ran out) or a schedule. */
export function effectiveStates(
  rows: readonly SwitchRow[],
  schedules: readonly ScheduleRow[],
  now: Date,
): EffectiveMap {
  const out = {} as EffectiveMap;
  for (const id of SECTION_IDS) {
    out[id] = { state: "on", message: null, until: null, includeAdmin: false, source: "manual" };
  }
  for (const r of rows) {
    if (!isSectionId(r.section) || r.state === "on") continue;
    if (r.until && new Date(r.until).getTime() <= now.getTime()) continue;
    out[r.section] = {
      state: r.state,
      message: r.message,
      until: r.until,
      includeAdmin: r.includeAdmin,
      source: "manual",
    };
  }
  for (const s of schedules) {
    if (!isSectionId(s.section) || !scheduleActive(s, now)) continue;
    const cur = out[s.section];
    if (SEVERITY[s.state] > SEVERITY[cur.state]) {
      out[s.section] = {
        state: s.state,
        message: s.message,
        until: null,
        includeAdmin: false,
        source: "schedule",
        scheduleId: s.id,
      };
    }
  }
  return out;
}

/** The section, the sections it needs (all the way down), and the whole-system switch. */
export function chainOf(section: SectionId): SectionId[] {
  const seen = new Set<SectionId>();
  const visit = (id: SectionId) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const n of SECTION_BY_ID[id].needs) visit(n);
  };
  visit(section);
  const chain = [...seen];
  if (chain.some((id) => UNDER_SYSTEM.has(id))) chain.unshift("system");
  return chain;
}

export type Block = {
  state: Exclude<SwitchState, "on">;
  /** The switch that stops it */
  section: SectionId | "user" | "group" | "type";
  message: string;
  until: string | null;
};

/**
 * Whether this capability is stopped right now, and by which switch. The admin is only ever
 * stopped by a switch with "also stop my own uploads" on.
 */
export function blockFor(
  cap: Capability,
  eff: EffectiveMap,
  opts: { admin?: boolean } = {},
): Block | null {
  let found: { id: SectionId; e: Effective } | null = null;
  for (const id of chainOf(CAPABILITY_SECTION[cap])) {
    const e = eff[id];
    if (e.state === "on") continue;
    if (e.state === "readonly" && !WRITE_CAPABILITIES.has(cap)) continue;
    if (opts.admin && !(e.includeAdmin && SECTION_BY_ID[id].adminOption)) continue;
    if (!found || SEVERITY[e.state] > SEVERITY[found.e.state]) found = { id, e };
  }
  if (!found) return null;
  const state = found.e.state as Exclude<SwitchState, "on">;
  return {
    state,
    section: found.id,
    message: found.e.message?.trim() || DEFAULT_MESSAGE[state],
    until: found.e.until,
  };
}

/** A user/group/type switch for this person or certificate type, if one is in force. */
export function accessBlock(
  cap: Capability,
  rows: readonly AccessRow[],
  who: { userId?: string; canUpload?: boolean; typeId?: string | null },
  now: Date,
): Block | null {
  let found: AccessRow | null = null;
  for (const r of rows) {
    if (r.until && new Date(r.until).getTime() <= now.getTime()) continue;
    const applies =
      (r.scope === "user" && who.userId === r.target) ||
      (r.scope === "group" &&
        who.userId !== undefined &&
        r.target === (who.canUpload ? "uploaders" : "viewers")) ||
      (r.scope === "type" && !!who.typeId && who.typeId === r.target);
    if (!applies) continue;
    if (r.state === "readonly" && !WRITE_CAPABILITIES.has(cap)) continue;
    if (!found || SEVERITY[r.state] > SEVERITY[found.state]) found = r;
  }
  if (!found) return null;
  return {
    state: found.state,
    section: found.scope,
    message: found.message?.trim() || DEFAULT_MESSAGE[found.state],
    until: found.until,
  };
}

/** What the map shows for a section: its own state, or "affected" by a section it needs. */
export type SectionView = SwitchState | "affected";

export function sectionView(
  id: SectionId,
  eff: EffectiveMap,
): { view: SectionView; by: SectionId[] } {
  const own = eff[id].state;
  if (own !== "on") return { view: own, by: [] };
  const writes = id === "downloads" || id === "uploads" || id === "extraction";
  const by = chainOf(id).filter((d) => {
    if (d === id) return false;
    const s = eff[d].state;
    return s === "hold" || s === "down" || (s === "readonly" && writes);
  });
  return by.length ? { view: "affected", by } : { view: "on", by: [] };
}

// ── Presets ───────────────────────────────────────────────────────────────────────

export type PresetStates = Partial<Record<SectionId, Exclude<SwitchState, "on">>>;

export const BUILT_IN_PRESETS: readonly {
  key: string;
  name: string;
  about: string;
  states: PresetStates;
}[] = [
  {
    key: "maintenance",
    name: "Maintenance",
    about: "Uploads and Extraction on Hold. Staff can still search, view and download.",
    states: { uploads: "hold", extraction: "hold" },
  },
  {
    key: "readonly-day",
    name: "Read-only day",
    about: "The whole staff side read-only: search and view only.",
    states: { system: "readonly" },
  },
  {
    key: "lock-everything",
    name: "Lock everything",
    about: "The whole staff side Down. Every staff member is signed out.",
    states: { system: "down" },
  },
];

/** Turning anything Down, or touching the whole system, needs the passkey again and CONFIRM. */
export function needsConfirm(changes: { section: SectionId; state: SwitchState }[]): boolean {
  return changes.some((c) => c.state === "down" || (c.section === "system" && c.state !== "on"));
}
