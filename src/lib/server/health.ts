import "server-only";

import { readFileSync } from "node:fs";

import {
  COMPONENT_BY_ID,
  mapStatuses,
  worst,
  type CheckResult,
  type ComponentId,
  type ComponentResult,
  type HealthResults,
  type Status,
} from "@/lib/system/map";
import { buildId, site } from "@/lib/site";

import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { bucketStatus, signedDownloadUrl, storageConfigured } from "./storage";

// The System Map's health checks. Each part of the system gets a few quick checks with a time
// limit, so one slow service can't hold up the rest. Results are saved, and a part that stops
// working opens an incident with one alert email (and another when it works again).

/** The newest migration this version of the app needs. */
export const LATEST_MIGRATION = "0010_system_map.sql";

/** Free plan limits used for the "limits" checks. */
export const FREE_LIMITS = {
  databaseBytes: 500 * 1024 * 1024,
  storageBytes: 1024 * 1024 * 1024,
  gmailPerDay: 500,
  resendPerDay: 100,
};

const STALE_CRON_MINUTES = 20;
const ALERTS_PER_DAY = 20;

export type HealthRun = {
  id: string;
  at: Date;
  source: string;
  ms: number;
  overall: "ok" | "warn" | "fail";
  results: HealthResults;
};

type Source = "cron" | "page" | "manual" | "diagnose";

class Timeout extends Error {}

async function timed<T>(fn: () => Promise<T>, ms: number): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Timeout(`no answer after ${ms / 1000} s`)), ms);
      }),
    ]);
    return { value, ms: Math.round(performance.now() - start) };
  } finally {
    clearTimeout(timer);
  }
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const pct = (n: number, of: number) => Math.round((n / of) * 100);
const errText = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 200);

function result(checks: CheckResult[], summary: string, ms?: number): ComponentResult {
  return { status: worst(checks.map((c) => c.status)), summary, ms, checks };
}

function limitCheck(name: string, used: number, limit: number, unit: (n: number) => string) {
  const p = pct(used, limit);
  return {
    name,
    status: (p >= 95 ? "fail" : p >= 80 ? "warn" : "ok") as Status,
    detail: `${unit(used)} of ${unit(limit)} used (${p}%)`,
  };
}

// ── The checks ───────────────────────────────────────────────────────────────────

function checkConfig(): ComponentResult {
  const e = process.env;
  const has = (k: string) => Boolean(e[k]);
  const checks: CheckResult[] = [
    {
      name: "Database address",
      status: has("DATABASE_URL") ? "ok" : "fail",
      detail: has("DATABASE_URL") ? "Set" : "DATABASE_URL is missing",
    },
    {
      name: "Sign-in secret",
      status: (e.AUTH_SECRET?.length ?? 0) >= 32 ? "ok" : "fail",
      detail: (e.AUTH_SECRET?.length ?? 0) >= 32 ? "Set" : "AUTH_SECRET is missing or too short",
    },
    {
      name: "Admin email",
      status: has("ADMIN_EMAIL") ? "ok" : "fail",
      detail: has("ADMIN_EMAIL") ? "Set" : "ADMIN_EMAIL is missing",
    },
    {
      name: "File storage keys",
      status: storageConfigured() ? "ok" : "warn",
      detail: storageConfigured()
        ? "Set"
        : "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing",
    },
    {
      name: "Email account",
      status:
        (has("SMTP_USER") && has("SMTP_APP_PASSWORD")) ||
        has("RESEND_API_KEY") ||
        (has("MAIL_FILE") && !e.VERCEL)
          ? "ok"
          : "warn",
      detail:
        has("SMTP_USER") && has("SMTP_APP_PASSWORD")
          ? "Gmail"
          : has("RESEND_API_KEY")
            ? "Resend"
            : has("MAIL_FILE") && !e.VERCEL
              ? "Test file"
              : "No email account set",
    },
    {
      name: "Scheduled job secret",
      status: (e.CRON_SECRET?.length ?? 0) >= 16 ? "ok" : "warn",
      detail: (e.CRON_SECRET?.length ?? 0) >= 16 ? "Set" : "CRON_SECRET is missing",
    },
    {
      name: "Site address",
      status: has("NEXT_PUBLIC_SITE_URL") ? "ok" : "warn",
      detail: has("NEXT_PUBLIC_SITE_URL")
        ? (e.NEXT_PUBLIC_SITE_URL ?? "")
        : "NEXT_PUBLIC_SITE_URL is missing (links in emails won't work)",
    },
  ];
  const missing = checks.filter((c) => c.status !== "ok").length;
  return result(
    checks,
    missing ? `${missing} setting${missing === 1 ? "" : "s"} to look at` : "All set",
  );
}

function checkApp(): ComponentResult {
  const build = buildId();
  return result(
    [
      {
        name: "Running",
        status: "ok",
        detail: `Version ${site.version}${build ? ` (build ${build})` : ""}, region ${process.env.VERCEL_REGION ?? "this computer"}, Node ${process.version}`,
      },
    ],
    `v${site.version} · ${process.env.VERCEL_REGION ?? "local"}`,
  );
}

async function checkDatabase(): Promise<ComponentResult> {
  const sql = db();
  const checks: CheckResult[] = [];
  let ms: number | undefined;
  try {
    const r = await timed(() => sql`select 1`, 10_000);
    ms = r.ms;
    checks.push({
      name: "Answers",
      status: r.ms > 2000 ? "warn" : "ok",
      detail: `In ${r.ms} ms${r.ms > 2000 ? " (slow)" : ""}`,
      ms: r.ms,
    });
  } catch (e) {
    return result(
      [{ name: "Answers", status: "fail", detail: `No answer: ${errText(e)}` }],
      "Not answering",
    );
  }
  try {
    const [open, [mig], [size]] = await Promise.all([
      sql<{ name: string }[]>`
        select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
          and c.relname <> 'schema_migrations'
      `,
      sql<{ ok: boolean; latest: string | null }[]>`
        select exists (select 1 from schema_migrations where name = ${LATEST_MIGRATION}) as ok,
          (select max(name) from schema_migrations) as latest
      `,
      sql<{ bytes: string }[]>`select pg_database_size(current_database())::text as bytes`,
    ]);
    checks.push({
      name: "Locked to the app (row security)",
      status: open.length ? "fail" : "ok",
      detail: open.length
        ? `Open to the public API: ${open.map((t) => t.name).join(", ")}`
        : "Every table is locked",
    });
    checks.push({
      name: "Up to date",
      status: mig?.ok ? "ok" : "warn",
      detail: mig?.ok
        ? `Latest change ${LATEST_MIGRATION.replace(".sql", "")}`
        : `Waiting for ${LATEST_MIGRATION}: run pnpm db:migrate (now at ${mig?.latest ?? "none"})`,
    });
    checks.push(
      limitCheck("Space (free plan)", Number(size?.bytes ?? 0), FREE_LIMITS.databaseBytes, mb),
    );
  } catch (e) {
    checks.push({ name: "Details", status: "warn", detail: `Couldn't read: ${errText(e)}` });
  }
  return result(checks, `Answers in ${ms} ms`, ms);
}

async function checkStorage(): Promise<ComponentResult> {
  if (!storageConfigured()) {
    return result(
      [{ name: "Set up", status: "warn", detail: "File storage keys are missing" }],
      "Not set up",
    );
  }
  const checks: CheckResult[] = [];
  let ms: number | undefined;
  try {
    const r = await timed(() => bucketStatus(), 10_000);
    ms = r.ms;
    checks.push({
      name: "Bucket",
      status: !r.value.exists ? "warn" : r.value.private ? "ok" : "fail",
      detail: !r.value.exists
        ? "Not created yet (made on the first upload)"
        : r.value.private
          ? `Private, answers in ${r.ms} ms`
          : "PUBLIC: anyone with a file address could open it",
      ms: r.ms,
    });
  } catch (e) {
    return result(
      [{ name: "Bucket", status: "fail", detail: `No answer: ${errText(e)}` }],
      "Not answering",
    );
  }
  try {
    const [[usage], [file]] = await Promise.all([
      db()<{ bytes: string }[]>`
        select coalesce(sum(size_bytes), 0)::text as bytes from certificate_files where status = 'ready'
      `,
      db()<{ storage_path: string }[]>`
        select storage_path from certificate_files where status = 'ready'
        order by created_at desc limit 1
      `,
    ]);
    checks.push(
      limitCheck("Space (free plan)", Number(usage?.bytes ?? 0), FREE_LIMITS.storageBytes, mb),
    );
    if (file) {
      const r = await timed(async () => {
        const url = await signedDownloadUrl(file.storage_path, 60);
        const res = await fetch(url, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
        await res.body?.cancel();
        return res.status;
      }, 10_000);
      checks.push({
        name: "Opening a file with a short link",
        status: r.value === 200 || r.value === 206 ? "ok" : "fail",
        detail:
          r.value === 200 || r.value === 206
            ? `Worked in ${r.ms} ms`
            : `The link didn't work (answer ${r.value})`,
        ms: r.ms,
      });
    }
  } catch (e) {
    checks.push({ name: "Opening a file with a short link", status: "fail", detail: errText(e) });
  }
  return result(checks, ms !== undefined ? `Answers in ${ms} ms` : "Checked", ms);
}

async function checkEmail(): Promise<ComponentResult> {
  const e = env();
  const provider =
    e.SMTP_USER && e.SMTP_APP_PASSWORD
      ? "Gmail"
      : e.RESEND_API_KEY
        ? "Resend"
        : e.MAIL_FILE
          ? "Test file"
          : null;
  const checks: CheckResult[] = [];
  if (!provider) {
    checks.push({
      name: "Account",
      status: process.env.VERCEL ? "fail" : "warn",
      detail: "No email account set, so sign-in codes and alerts can't be sent",
    });
    return result(checks, "Not set up");
  }
  checks.push({ name: "Account", status: "ok", detail: provider });
  const [row] = await db()<
    { today: number; failed: number; last_ok: boolean | null; last_error: string | null }[]
  >`
    select
      (select count(*)::int from mail_log where ok and at > date_trunc('day', now())) as today,
      (select count(*)::int from mail_log where not ok and at > now() - interval '1 hour') as failed,
      (select ok from mail_log order by at desc limit 1) as last_ok,
      (select error from mail_log where not ok order by at desc limit 1) as last_error
  `;
  checks.push({
    name: "Recent sending",
    status: row?.last_ok === false ? "fail" : row?.failed ? "warn" : "ok",
    detail:
      row?.last_ok === false
        ? `The last email failed: ${row.last_error ?? "unknown error"}`
        : row?.failed
          ? `${row.failed} failed in the last hour, then sent again`
          : row?.last_ok
            ? "The last email was sent"
            : "Nothing sent yet",
  });
  const limit = provider === "Resend" ? FREE_LIMITS.resendPerDay : FREE_LIMITS.gmailPerDay;
  checks.push(limitCheck("Sent today (free limit)", row?.today ?? 0, limit, (n) => `${n}`));
  return result(checks, `${provider} · ${row?.today ?? 0} sent today`);
}

async function checkScheduler(): Promise<ComponentResult> {
  const [row] = await db()<{ cron: Date | null; daily: Date | null }[]>`
    select (select max(at) from health_runs where source = 'cron') as cron,
      (select max(at) from health_runs where source = 'daily') as daily
  `;
  const ago = (d: Date | null) =>
    d ? Math.round((Date.now() - new Date(d).getTime()) / 60000) : null;
  const cron = ago(row?.cron ?? null);
  const daily = ago(row?.daily ?? null);
  const checks: CheckResult[] = [
    {
      name: "Checks every 5 minutes (cron-job.org)",
      status:
        cron === null ? "warn" : cron > 60 ? "fail" : cron > STALE_CRON_MINUTES ? "warn" : "ok",
      detail:
        cron === null
          ? "Not set up yet: add the cron-job.org job (see Setup on this page)"
          : `Last ran ${cron < 1 ? "just now" : `${cron} min ago`}`,
    },
    {
      name: "Daily job (Vercel Cron)",
      status: daily === null ? "warn" : daily > 26 * 60 ? "warn" : "ok",
      detail:
        daily === null
          ? "Hasn't run yet (it runs at 03:00 Sri Lanka time once deployed)"
          : `Last ran ${daily < 120 ? `${daily} min` : `${Math.round(daily / 60)} h`} ago`,
    },
  ];
  return result(
    checks,
    cron === null ? "Not set up" : `Last check ${cron < 1 ? "just now" : `${cron} min ago`}`,
  );
}

async function fetchStatus(url: string, init: RequestInit = {}) {
  return timed(async () => {
    const res = await fetch(url, { cache: "no-store", redirect: "manual", ...init });
    // Read the (small) answer to the end, so the connection is free for the next check
    await res.arrayBuffer().catch(() => undefined);
    return res;
  }, 8000);
}

async function checkGate(origin: string | null): Promise<ComponentResult> {
  if (!origin) {
    return result(
      [
        {
          name: "Reachable",
          status: "warn",
          detail: "Site address unknown: set NEXT_PUBLIC_SITE_URL",
        },
      ],
      "Not checked",
    );
  }
  const checks: CheckResult[] = [];
  let ms: number | undefined;
  try {
    const r = await fetchStatus(`${origin}/`);
    ms = r.ms;
    const h = r.value.headers;
    const missing = [
      ["content-security-policy", "Content-Security-Policy"],
      ["x-frame-options", "X-Frame-Options"],
      ["x-content-type-options", "X-Content-Type-Options"],
      ["referrer-policy", "Referrer-Policy"],
      ...(origin.startsWith("https:") ? [["strict-transport-security", "HSTS"]] : []),
    ].filter(([k]) => !h.get(k!));
    checks.push({
      name: "Sign-in page",
      status: r.value.status === 200 ? "ok" : "fail",
      detail: r.value.status === 200 ? `Opens in ${r.ms} ms` : `Answered ${r.value.status}`,
      ms: r.ms,
    });
    checks.push({
      name: "Security headers",
      status: missing.length ? "fail" : "ok",
      detail: missing.length ? `Missing: ${missing.map((m) => m[1]).join(", ")}` : "All present",
    });
    const admin = await fetchStatus(`${origin}/admin`);
    const to = admin.value.headers.get("location") ?? "";
    checks.push({
      name: "Private pages need sign-in",
      status:
        admin.value.status >= 300 && admin.value.status < 400 && to.includes("/admin/login")
          ? "ok"
          : "fail",
      detail:
        admin.value.status >= 300 && admin.value.status < 400 && to.includes("/admin/login")
          ? "Signed-out visitors are sent to sign in"
          : `The admin area answered ${admin.value.status} without a sign-in`,
    });
  } catch (e) {
    checks.push({ name: "Sign-in page", status: "fail", detail: `No answer: ${errText(e)}` });
  }
  return result(checks, ms !== undefined ? `Pages open in ${ms} ms` : "Not answering", ms);
}

async function checkReader(origin: string | null): Promise<ComponentResult> {
  if (!origin)
    return result(
      [{ name: "Files", status: "unknown", detail: "Site address unknown" }],
      "Not checked",
    );
  const files = ["worker.min.js", "pdf.worker.min.mjs", "lang/eng.traineddata.gz"];
  const checks: CheckResult[] = [];
  for (const f of files) {
    try {
      const r = await fetchStatus(`${origin}/ocr/${f}`, { method: "HEAD" });
      checks.push({
        name: f.split("/").pop()!,
        status: r.value.status === 200 ? "ok" : "fail",
        detail: r.value.status === 200 ? "Ready" : `Missing (answer ${r.value.status})`,
      });
    } catch (e) {
      checks.push({ name: f, status: "fail", detail: errText(e) });
    }
  }
  return result(
    checks,
    checks.every((c) => c.status === "ok") ? "Engine files ready" : "Engine files missing",
  );
}

async function checkGeocoder(): Promise<ComponentResult> {
  if (env().REVERSE_GEOCODE === "off") {
    return {
      status: "off",
      summary: "Turned off",
      checks: [{ name: "Turned off", status: "off", detail: "REVERSE_GEOCODE=off" }],
    };
  }
  try {
    const r = await fetchStatus("https://nominatim.openstreetmap.org/status?format=json", {
      headers: { "User-Agent": `OravaCertificateStore/${site.version}` },
    });
    const ok = r.value.status === 200;
    return result(
      [
        {
          name: "Answers",
          // Only street names depend on it, so it never counts as broken
          status: ok ? "ok" : "warn",
          detail: ok ? `In ${r.ms} ms` : `Answered ${r.value.status}; places show without a street`,
          ms: r.ms,
        },
      ],
      ok ? `Answers in ${r.ms} ms` : "Not answering",
      r.ms,
    );
  } catch (e) {
    return result(
      [{ name: "Answers", status: "warn", detail: `${errText(e)}; places show without a street` }],
      "Not answering",
    );
  }
}

async function checkBrowsers(): Promise<ComponentResult> {
  const [row] = await db()<{ last: Date | null; people: number }[]>`
    select max(last_seen_at) as last,
      count(distinct user_id) filter (where last_seen_at > now() - interval '15 minutes')::int as people
    from sessions where revoked_at is null and expires_at > now()
  `;
  return {
    status: "ok",
    summary: row?.people ? `${row.people} using it now` : "Nobody signed in right now",
    checks: [
      {
        name: "In use",
        status: "ok",
        detail: row?.last
          ? `Last activity ${Math.max(0, Math.round((Date.now() - new Date(row.last).getTime()) / 60000))} min ago`
          : "No one signed in",
      },
    ],
  };
}

/**
 * Test-only: parts to report as broken, listed in the file named by HEALTH_TEST_FAIL_FILE
 * ("storage", or "storage:fixable" to pass again once Diagnose & Fix has tried a fix).
 * Never on Vercel.
 */
export function testFailList(): string[] | undefined {
  const file = process.env.HEALTH_TEST_FAIL_FILE;
  if (process.env.VERCEL || process.env.HEALTH_TEST_HOOKS !== "on" || !file) return undefined;
  try {
    const list = readFileSync(file, "utf8")
      .split(/[\s,]+/)
      .filter(Boolean);
    return list.length ? list : undefined;
  } catch {
    return undefined;
  }
}

function testFailures(list: string[] | undefined): ComponentId[] {
  if (process.env.VERCEL || process.env.HEALTH_TEST_HOOKS !== "on" || !list) return [];
  return list
    .map((c) => c.replace(/:fixable$/, ""))
    .filter((c): c is ComponentId => c in COMPONENT_BY_ID);
}

/** Runs every check (or only some parts), at the same time. */
export async function runChecks(
  origin: string | null,
  opts: { only?: ComponentId[]; testFail?: string[] } = {},
): Promise<{ results: HealthResults; ms: number }> {
  const start = performance.now();
  const all: Record<ComponentId, () => Promise<ComponentResult> | ComponentResult> = {
    config: checkConfig,
    app: checkApp,
    database: checkDatabase,
    storage: checkStorage,
    email: checkEmail,
    scheduler: checkScheduler,
    gate: () => checkGate(origin),
    reader: () => checkReader(origin),
    geocoder: checkGeocoder,
    browser: checkBrowsers,
  };
  const ids = (opts.only ?? (Object.keys(all) as ComponentId[])).filter((id) => id in all);
  const broken = testFailures("testFail" in opts ? opts.testFail : testFailList());
  const entries = await Promise.all(
    ids.map(async (id): Promise<[ComponentId, ComponentResult]> => {
      if (broken.includes(id)) {
        return [
          id,
          result(
            [{ name: "Test", status: "fail", detail: "Broken on purpose by a test" }],
            "Not answering",
          ),
        ];
      }
      try {
        return [id, await all[id]()];
      } catch (e) {
        return [
          id,
          result([{ name: "Check", status: "fail", detail: errText(e) }], "Check failed"),
        ];
      }
    }),
  );
  return { results: Object.fromEntries(entries), ms: Math.round(performance.now() - start) };
}

function overallOf(results: HealthResults): "ok" | "warn" | "fail" {
  const w = worst(Object.values(results).map((r) => r.status));
  return w === "fail" ? "fail" : w === "warn" ? "warn" : "ok";
}

/** Runs the checks, saves them, and opens or closes incidents (with emails). */
export async function checkAndRecord(
  source: Source,
  origin: string | null,
  opts: { testFail?: string[] } = {},
): Promise<HealthRun> {
  const { results, ms } = await runChecks(origin, opts);
  const sql = db();
  const overall = overallOf(results);
  const [row] = await sql<{ id: string; at: Date }[]>`
    insert into health_runs (source, ms, overall, results)
    values (${source}, ${ms}, ${overall}, ${sql.json(results as never)})
    returning id::text, at
  `;
  await sql`delete from health_runs where at < now() - interval '7 days'`;
  await updateIncidents(results);
  return { id: row!.id, at: row!.at, source, ms, overall, results };
}

/** The daily job notes that it ran (the Scheduled checks part reads it). */
export async function recordDailyRun(): Promise<void> {
  await db()`insert into health_runs (source, overall, results) values ('daily', 'ok', '{}'::jsonb)`;
}

export async function latestRun(): Promise<HealthRun | null> {
  const [row] = await db()<HealthRun[]>`
    select id::text, at, source, ms, overall, results from health_runs
    where source <> 'daily' order by at desc limit 1
  `;
  return row ?? null;
}

export type Incident = {
  id: string;
  component: ComponentId;
  status: "open" | "resolved";
  summary: string;
  started_at: Date;
  last_seen_at: Date;
  resolved_at: Date | null;
  notified_at: Date | null;
};

export async function openIncidents(): Promise<Incident[]> {
  return db()<Incident[]>`
    select id::text, component, status, summary, started_at, last_seen_at, resolved_at, notified_at
    from incidents where status = 'open' order by started_at
  `;
}

export async function recentIncidents(limit = 20): Promise<Incident[]> {
  return db()<Incident[]>`
    select id::text, component, status, summary, started_at, last_seen_at, resolved_at, notified_at
    from incidents order by started_at desc limit ${limit}
  `;
}

async function alertAddress(): Promise<string> {
  const [row] = await db()<{ alert_email: string | null }[]>`
    select alert_email from app_settings where id = true
  `;
  return row?.alert_email || env().ADMIN_EMAIL;
}

function failingSummary(r: ComponentResult): string {
  const bad = r.checks.filter((c) => c.status === "fail");
  return (bad.length ? bad.map((c) => `${c.name}: ${c.detail}`).join("; ") : r.summary).slice(
    0,
    500,
  );
}

/**
 * A part whose own checks fail (not only because a part it needs is down) opens an incident.
 * It is closed as soon as the part passes again. One email each way, at most 20 a day.
 */
async function updateIncidents(results: HealthResults): Promise<void> {
  const sql = db();
  const statuses = mapStatuses(results);
  const failing = (Object.keys(results) as ComponentId[]).filter((id) => statuses[id] === "fail");
  const checked = Object.keys(results) as ComponentId[];
  const siteUrl = env().NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const link = siteUrl ? `\n\nOpen the System Map: ${siteUrl}/admin/system` : "";

  const [sent] = await sql<{ n: number }[]>`
    select count(*)::int as n from incidents
    where notified_at > now() - interval '1 day' or resolved_notified_at > now() - interval '1 day'
  `;
  let budget = ALERTS_PER_DAY - (sent?.n ?? 0);

  for (const id of failing) {
    const summary = failingSummary(results[id]!);
    const [inc] = await sql<{ id: string; notified_at: Date | null }[]>`
      insert into incidents (component, summary) values (${id}, ${summary})
      on conflict (component) where status = 'open'
      do update set last_seen_at = now(), summary = excluded.summary
      returning id::text, notified_at
    `;
    if (inc && !inc.notified_at && budget > 0) {
      budget--;
      try {
        await sendMail({
          to: await alertAddress(),
          subject: `${site.name}: ${COMPONENT_BY_ID[id].name} is not working`,
          text: `${COMPONENT_BY_ID[id].name} (${COMPONENT_BY_ID[id].provider}) stopped working.\n\n${summary}\n\nYou'll get another email when it works again. "Diagnose & Fix" on the System Map tries the safe fixes and tells you what to do.${link}`,
        });
        await sql`update incidents set notified_at = now() where id = ${inc.id}`;
      } catch (e) {
        console.error("incident email failed", e);
      }
    }
  }

  const fixed = await sql<
    { id: string; component: ComponentId; started_at: Date; notified_at: Date | null }[]
  >`
    update incidents set status = 'resolved', resolved_at = now()
    where status = 'open' and component = any(${checked}::text[])
      and not (component = any(${failing}::text[]))
    returning id::text, component, started_at, notified_at
  `;
  for (const inc of fixed) {
    if (!inc.notified_at || budget <= 0) continue;
    budget--;
    const mins = Math.max(1, Math.round((Date.now() - new Date(inc.started_at).getTime()) / 60000));
    try {
      await sendMail({
        to: await alertAddress(),
        subject: `${site.name}: ${COMPONENT_BY_ID[inc.component].name} works again`,
        text: `${COMPONENT_BY_ID[inc.component].name} is working again after about ${mins} minute${mins === 1 ? "" : "s"}.${link}`,
      });
      await sql`update incidents set resolved_notified_at = now() where id = ${inc.id}`;
    } catch (e) {
      console.error("resolved email failed", e);
    }
  }
}
