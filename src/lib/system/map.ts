// The parts of the system and the connections between them, as drawn on the System Map.
// Shared by the server (health checks) and the browser (the diagram), so no server imports.

export type Status = "ok" | "warn" | "fail" | "off" | "unknown";
/** A part's status on the map: "affected" means it only fails because a part it needs failed */
export type MapStatus = Status | "affected";

export type CheckResult = {
  name: string;
  status: Status;
  /** Plain words: what was found */
  detail: string;
  ms?: number;
};

export type ComponentResult = {
  status: Status;
  /** One line for the map, e.g. "Answers in 42 ms" */
  summary: string;
  ms?: number;
  checks: CheckResult[];
};

export type HealthResults = Partial<Record<ComponentId, ComponentResult>>;

export type ComponentId =
  | "browser"
  | "app"
  | "gate"
  | "database"
  | "storage"
  | "email"
  | "scheduler"
  | "reader"
  | "geocoder"
  | "config";

export type Component = {
  id: ComponentId;
  name: string;
  /** Who runs it */
  provider: string;
  about: string;
  /** Parts it can't work without: when one of them fails, this part is "affected" */
  needs: ComponentId[];
  /** Where it sits on the diagram (column, row) */
  at: [number, number];
};

export const COMPONENTS: Component[] = [
  {
    id: "browser",
    name: "Browsers",
    provider: "Staff and admin phones and computers",
    about:
      "Where people use the app. Pages, the reading engine and certificate files all end up here.",
    needs: [],
    at: [0, 1],
  },
  {
    id: "gate",
    name: "Sign-in gate",
    provider: "Vercel (proxy)",
    about:
      "Every request passes here first: it sends signed-out people to the sign-in page and adds the security headers.",
    needs: ["app"],
    at: [1, 1],
  },
  {
    id: "app",
    name: "App server",
    provider: "Vercel",
    about: "Runs the pages, sign-in, search, reports and every action, and talks to the services.",
    needs: [],
    at: [2, 1],
  },
  {
    id: "config",
    name: "Settings and secrets",
    provider: "Vercel environment variables",
    about: "The keys and addresses the app needs: database, storage, email, sign-in secret.",
    needs: [],
    at: [2, 0],
  },
  {
    id: "database",
    name: "Database",
    provider: "Supabase Postgres",
    about:
      "Keeps certificates, types, labs, staff, sign-ins and the activity log. Locked so only the app server can use it.",
    needs: [],
    at: [3, 0],
  },
  {
    id: "storage",
    name: "File storage",
    provider: "Supabase Storage",
    about:
      "Keeps the certificate PDFs and images in a private bucket. Files are opened only through links that expire after a minute.",
    needs: [],
    at: [3, 1],
  },
  {
    id: "email",
    name: "Email",
    provider: "Gmail or Resend",
    about: "Sends sign-in codes, alerts and backup reminders.",
    needs: [],
    at: [3, 2],
  },
  {
    id: "reader",
    name: "Reading engine",
    provider: "In the admin's browser",
    about:
      "Reads text from scans when certificates are added. It loads from this site and runs on the computer itself, so files never go to another service.",
    needs: ["app"],
    at: [1, 2],
  },
  {
    id: "geocoder",
    name: "Address lookup",
    provider: "OpenStreetMap (free)",
    about: "Turns a shared sign-in location into a street address.",
    needs: [],
    at: [3, 3],
  },
  {
    id: "scheduler",
    name: "Scheduled checks",
    provider: "cron-job.org and Vercel Cron",
    about:
      "Runs these checks every 5 minutes when nobody has the map open, and the daily Trash clean-up and backup reminder.",
    needs: ["app"],
    at: [1, 0],
  },
];

export const COMPONENT_BY_ID = Object.fromEntries(COMPONENTS.map((c) => [c.id, c])) as Record<
  ComponentId,
  Component
>;

export type Connection = {
  id: string;
  from: ComponentId;
  to: ComponentId;
  label: string;
  /** A shorter label for the diagram, where lines between boxes are short */
  short?: string;
  /** What flows through it, in plain words */
  about: string;
  /** An example of what is sent, with private parts hidden */
  sample: string;
};

export const CONNECTIONS: Connection[] = [
  {
    id: "browser-gate",
    from: "browser",
    to: "gate",
    label: "Pages",
    about:
      "Every page and action request, over HTTPS. The sign-in cookie goes with it; it can't be read by scripts on the page.",
    sample: "GET /certificates?q=ruby\nCookie: __Host-orava_session=•••••• (hidden)",
  },
  {
    id: "gate-app",
    short: "Requests",
    from: "gate",
    to: "app",
    label: "Checked requests",
    about:
      "Requests the gate let through, with security headers added. Signed-out visitors never get past the gate to private pages.",
    sample: "GET /certificates → 200, Content-Security-Policy: default-src 'self'; …",
  },
  {
    id: "app-config",
    from: "config",
    to: "app",
    label: "Secrets",
    about:
      "Read once when the server starts. They never reach a browser; the System Map shows only whether each one is set.",
    sample: "DATABASE_URL = postgres://postgres.•••:•••@…pooler.supabase.com:6543/postgres",
  },
  {
    id: "app-database",
    from: "app",
    to: "database",
    label: "Queries",
    about:
      "Searches, saves and the activity log. Every value is sent separately from the query text, so typed text can't change a query.",
    sample: "select … from certificates where report_no ilike $1 limit 25\n$1 = '%AIGS•••%'",
  },
  {
    id: "app-storage",
    short: "Links",
    from: "app",
    to: "storage",
    label: "Signed links",
    about:
      "The server asks storage for a link to one file that works for 60 seconds, after checking who is asking.",
    sample: 'POST /object/sign/certificates/2026/•••/a1b2.pdf\n{ "expiresIn": 60 }',
  },
  {
    id: "browser-storage",
    from: "browser",
    to: "storage",
    label: "Files",
    about:
      "The browser opens or uploads the file straight from storage with the short link, so big files never slow the server.",
    sample: "GET https://•••.supabase.co/storage/v1/object/sign/certificates/•••?token=•••",
  },
  {
    id: "app-email",
    from: "app",
    to: "email",
    label: "Emails",
    about: "Sign-in codes, alerts when something breaks or is fixed, and backup reminders.",
    sample: "To: s•••@gmail.com\nSubject: Your Orava sign-in code\nCode: ••••••",
  },
  {
    id: "browser-reader",
    short: "Engine",
    from: "browser",
    to: "reader",
    label: "Reading files",
    about: "The admin's browser loads the reading engine from this site and reads scans itself.",
    sample: "GET /ocr/worker.min.js, /ocr/lang/eng.traineddata.gz",
  },
  {
    id: "app-geocoder",
    short: "Lookup",
    from: "app",
    to: "geocoder",
    label: "Address lookup",
    about: "Once per sign-in that shared its location: only the position goes, never a name.",
    sample: "GET /reverse?lat=6.91•••&lon=79.84•••&format=jsonv2",
  },
  {
    id: "scheduler-app",
    short: "5 min",
    from: "scheduler",
    to: "app",
    label: "Every 5 minutes",
    about:
      "cron-job.org calls the health check with a secret; Vercel Cron calls the daily job at 03:00.",
    sample: "GET /api/health/check\nx-cron-secret: •••••• (hidden)",
  },
];

export const STATUS_LABEL: Record<MapStatus, string> = {
  ok: "Working",
  warn: "Needs attention",
  fail: "Not working",
  affected: "Affected by another part",
  off: "Turned off",
  unknown: "Not checked yet",
};

const RANK: Record<Status, number> = { ok: 0, off: 0, unknown: 1, warn: 2, fail: 3 };

/** The worst of several statuses. */
export function worst(list: Status[]): Status {
  return list.reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), "ok");
}

/**
 * Each part's status on the map. A failing part that only fails because a part it needs is
 * down shows as "affected", so the real cause stands out.
 */
export function mapStatuses(results: HealthResults): Record<ComponentId, MapStatus> {
  const out = {} as Record<ComponentId, MapStatus>;
  for (const c of COMPONENTS) {
    const own = results[c.id]?.status ?? "unknown";
    const cause = c.needs.some((n) => results[n]?.status === "fail");
    out[c.id] = cause && (own === "fail" || own === "warn") ? "affected" : own;
  }
  return out;
}

/** A connection is as healthy as the worse of its two ends. */
export function connectionStatus(
  c: Connection,
  statuses: Record<ComponentId, MapStatus>,
): MapStatus {
  const a = statuses[c.from];
  const b = statuses[c.to];
  if (a === "fail" || b === "fail") return "fail";
  if (a === "affected" || b === "affected") return "affected";
  if (a === "warn" || b === "warn") return "warn";
  if (b === "off") return "off";
  if (a === "unknown" || b === "unknown") return "unknown";
  return "ok";
}
