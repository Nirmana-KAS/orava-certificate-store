import "server-only";

import { revalidatePath } from "next/cache";

import {
  COMPONENT_BY_ID,
  COMPONENTS,
  STATUS_LABEL,
  type ComponentId,
  type ComponentResult,
  type Status,
} from "@/lib/system/map";
import { site } from "@/lib/site";

import { db } from "./db";
import { env } from "./env";
import { checkAndRecord, runChecks, testFailList } from "./health";
import { sendMail } from "./mail";
import { ensureBucket, storageConfigured } from "./storage";

// "Diagnose & Fix": checks a part again step by step, tries the fixes that are always safe
// (never deleting certificates, files, staff or sign-ins), checks again, and writes down every
// step so the admin can read or download what happened and what is left for them to do.

export type Step = {
  /** Milliseconds since the start */
  t: number;
  kind: "check" | "fix" | "note";
  title: string;
  status: Status | "done" | "skipped";
  detail: string;
};

export type DiagnoseReport = {
  target: ComponentId | "all";
  version: string;
  steps: Step[];
  before: Partial<Record<ComponentId, ComponentResult>>;
  after: Partial<Record<ComponentId, ComponentResult>>;
  /** What the admin has to do, in plain words, when a fix needs a person */
  advice: string[];
};

export type Outcome = "fixed" | "ok" | "still_failing" | "needs_you";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  fixed: "Fixed",
  ok: "Nothing was wrong",
  still_failing: "Still not working",
  needs_you: "Needs you",
};

type Ctx = {
  origin: string | null;
  testFail?: string[];
  report: DiagnoseReport;
  start: number;
};

const errText = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 200);

function step(ctx: Ctx, s: Omit<Step, "t">) {
  ctx.report.steps.push({ t: Math.round(performance.now() - ctx.start), ...s });
}

/** Parts named "storage:fixable" in a test fail only until a fix has been tried. */
function failAfterFix(list: string[] | undefined) {
  return list?.filter((c) => !c.endsWith(":fixable"));
}
const failBeforeFix = (list: string[] | undefined) => list?.map((c) => c.replace(/:fixable$/, ""));

const ADVICE: Partial<Record<ComponentId, (r: ComponentResult) => string[]>> = {
  config: (r) => [
    ...r.checks.filter((c) => c.status !== "ok").map((c) => `${c.name}: ${c.detail}.`),
    "Add the missing settings in Vercel → your project → Settings → Environment Variables (the names are in .env.example), then redeploy.",
  ],
  scheduler: () => [
    "Open cron-job.org (free) and create a job that calls this site's /api/health/check every 5 minutes, with a header x-cron-secret set to your CRON_SECRET. The Setup box on the System Map has the exact address.",
    "If the job exists, open its history on cron-job.org: a 401 answer means the secret doesn't match the CRON_SECRET in Vercel.",
  ],
  email: () => [
    "For Gmail: check SMTP_USER and SMTP_APP_PASSWORD in Vercel. An app password stops working if the Google account's password was changed; make a new one at myaccount.google.com → Security → App passwords.",
    "If the daily limit was reached, emails start working again tomorrow.",
  ],
  database: () => [
    "Open the Supabase dashboard. A free project that wasn't used for 7 days is paused: press Restore project.",
    "If the database password was changed, update DATABASE_URL in Vercel and redeploy.",
    "If it says 'Waiting for' a change, run pnpm db:migrate on your computer.",
  ],
  storage: () => [
    "Open the Supabase dashboard and check the project isn't paused.",
    "If the service role key was changed, update SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.",
    "If the free 1 GB is nearly full, download a backup and empty the Trash.",
  ],
  gate: () => [
    "Open the site in a private window. If it doesn't load, check status.vercel.com and your Vercel project's latest deployment.",
    "Redeploying the latest deployment in Vercel (or the Redeploy button here, when set up) usually fixes a broken deployment.",
  ],
  app: () => ["Check the latest deployment in Vercel; redeploy it if it failed."],
  reader: () => [
    "The reading engine's files are part of each deployment. Redeploy the latest deployment in Vercel; if it keeps failing, run pnpm build on your computer and check for errors.",
  ],
  geocoder: () => [
    "OpenStreetMap's free address lookup is down or busy. Nothing to do: locations still show with a map pin, only the street name is missing until it is back.",
  ],
};

async function fixDatabase(ctx: Ctx) {
  // Close the connection and open a new one: fixes a connection the pooler dropped
  const g = globalThis as unknown as {
    __oravaSql?: { end: (o?: { timeout?: number }) => Promise<void> };
  };
  try {
    await g.__oravaSql?.end({ timeout: 2 });
  } catch {
    // already closed
  }
  delete g.__oravaSql;
  step(ctx, {
    kind: "fix",
    title: "Opened a new database connection",
    status: "done",
    detail: "The old connection was closed",
  });
  for (let i = 1; i <= 3; i++) {
    try {
      await db()`select 1`;
      step(ctx, {
        kind: "check",
        title: `Try ${i}: database answers`,
        status: "ok",
        detail: "Connected",
      });
      break;
    } catch (e) {
      step(ctx, {
        kind: "check",
        title: `Try ${i}: database answers`,
        status: "fail",
        detail: errText(e),
      });
      if (i < 3) await new Promise((r) => setTimeout(r, i * 1500));
    }
  }
}

async function tidyDatabase(ctx: Ctx) {
  try {
    const sql = db();
    const [a, b, c, d, e] = await Promise.all([
      sql`delete from login_challenges where expires_at < now() - interval '1 day'`,
      sql`delete from trusted_devices where expires_at < now()`,
      sql`delete from ip_blocks where expires_at is not null and expires_at < now()`,
      sql`delete from login_attempts where at < now() - interval '90 days'`,
      sql`delete from mail_log where at < now() - interval '30 days'`,
    ]);
    const n = [a, b, c, d, e].reduce((s, r) => s + r.count, 0);
    step(ctx, {
      kind: "fix",
      title: "Tidied old sign-in leftovers",
      status: "done",
      detail: n
        ? `Removed ${n} expired codes, devices, blocks and attempts older than 90 days (no certificates, staff or sign-ins)`
        : "Nothing to tidy",
    });
  } catch (e) {
    step(ctx, {
      kind: "fix",
      title: "Tidied old sign-in leftovers",
      status: "skipped",
      detail: errText(e),
    });
  }
}

async function fixStorage(ctx: Ctx) {
  if (!storageConfigured()) {
    step(ctx, {
      kind: "fix",
      title: "Check the bucket",
      status: "skipped",
      detail: "File storage keys are missing",
    });
    return;
  }
  try {
    await ensureBucket(true);
    step(ctx, {
      kind: "fix",
      title: "Made sure the bucket exists and is private",
      status: "done",
      detail: "Created it or set it back to private, if needed",
    });
  } catch (e) {
    step(ctx, {
      kind: "fix",
      title: "Made sure the bucket exists and is private",
      status: "fail",
      detail: errText(e),
    });
  }
}

async function fixEmail(ctx: Ctx, to: string) {
  try {
    await sendMail({
      to,
      subject: `${site.name}: test email from Diagnose & Fix`,
      text: "This is a test from the System Map. If you can read it, emails are working.",
    });
    step(ctx, { kind: "fix", title: "Sent a test email", status: "ok", detail: `To ${to}` });
  } catch (e) {
    step(ctx, { kind: "fix", title: "Sent a test email", status: "fail", detail: errText(e) });
  }
}

function clearCaches(ctx: Ctx) {
  try {
    revalidatePath("/", "layout");
    step(ctx, {
      kind: "fix",
      title: "Cleared the saved pages",
      status: "done",
      detail: "Every page is built fresh on its next visit",
    });
  } catch (e) {
    step(ctx, {
      kind: "fix",
      title: "Cleared the saved pages",
      status: "skipped",
      detail: errText(e),
    });
  }
}

function logResults(
  ctx: Ctx,
  label: string,
  results: Partial<Record<ComponentId, ComponentResult>>,
) {
  for (const [id, r] of Object.entries(results) as [ComponentId, ComponentResult][]) {
    for (const c of r.checks) {
      step(ctx, {
        kind: "check",
        title: `${label} · ${COMPONENT_BY_ID[id].name} · ${c.name}`,
        status: c.status,
        detail: c.detail,
      });
    }
  }
}

const bad = (r?: ComponentResult) => r?.status === "fail" || r?.status === "warn";

/** Checks, fixes what is safe to fix, checks again and saves the report. */
export async function diagnose(
  target: ComponentId | "all",
  by: { email: string },
  origin: string | null,
): Promise<{ id: string; outcome: Outcome; report: DiagnoseReport; ms: number }> {
  const testFail = testFailList();
  const ctx: Ctx = {
    origin,
    testFail,
    start: performance.now(),
    report: { target, version: site.version, steps: [], before: {}, after: {}, advice: [] },
  };
  const ids = target === "all" ? COMPONENTS.map((c) => c.id) : [target];
  step(ctx, {
    kind: "note",
    title: target === "all" ? "Checking every part" : `Checking ${COMPONENT_BY_ID[target].name}`,
    status: "done",
    detail: `Started by ${by.email}`,
  });

  const before = (await runChecks(origin, { only: ids, testFail: failBeforeFix(testFail) }))
    .results;
  ctx.report.before = before;
  logResults(ctx, "Before", before);

  const broken = ids.filter((id) => bad(before[id]));
  if (broken.length === 0) {
    step(ctx, {
      kind: "note",
      title: "Nothing needs fixing",
      status: "ok",
      detail: "Every check passed",
    });
  } else {
    step(ctx, {
      kind: "note",
      title: "Trying the safe fixes",
      status: "done",
      detail: broken
        .map((id) => `${COMPONENT_BY_ID[id].name}: ${STATUS_LABEL[before[id]!.status]}`)
        .join("; "),
    });
    if (broken.includes("database")) await fixDatabase(ctx);
    if (broken.some((id) => id === "database" || id === "storage")) await tidyDatabase(ctx);
    if (broken.includes("storage")) await fixStorage(ctx);
    if (broken.includes("email") && process.env.HEALTH_TEST_HOOKS !== "on") {
      const [row] = await db()<
        { alert_email: string | null }[]
      >`select alert_email from app_settings where id = true`.catch(
        () => [] as { alert_email: string | null }[],
      );
      await fixEmail(ctx, row?.alert_email || env().ADMIN_EMAIL);
    }
    if (broken.some((id) => id === "app" || id === "gate" || id === "reader")) clearCaches(ctx);
  }

  // Check again, save it as a normal run (so incidents close when fixed) and compare
  const run = await checkAndRecord("diagnose", origin, { testFail: failAfterFix(testFail) });
  const after = Object.fromEntries(ids.map((id) => [id, run.results[id]!])) as typeof before;
  ctx.report.after = after;
  if (broken.length) logResults(ctx, "After", after);

  const still = ids.filter((id) => bad(after[id]));
  const failing = still.filter((id) => after[id]?.status === "fail");
  for (const id of still) {
    for (const line of ADVICE[id]?.(after[id]!) ?? [])
      ctx.report.advice.push(`${COMPONENT_BY_ID[id].name}: ${line}`);
  }
  const outcome: Outcome =
    broken.length === 0 && still.length === 0
      ? "ok"
      : still.length === 0
        ? "fixed"
        : failing.length && !ctx.report.advice.length
          ? "still_failing"
          : "needs_you";
  step(ctx, {
    kind: "note",
    title: OUTCOME_LABEL[outcome],
    status: still.length ? (failing.length ? "fail" : "warn") : "ok",
    detail: still.length
      ? `Still needs attention: ${still.map((id) => COMPONENT_BY_ID[id].name).join(", ")}`
      : broken.length
        ? "Everything works again"
        : "Everything works",
  });

  const ms = Math.round(performance.now() - ctx.start);
  const [row] = await db()<{ id: string }[]>`
    insert into diagnose_reports (by_email, component, outcome, ms, report)
    values (${by.email}, ${target}, ${outcome}, ${ms}, ${db().json(ctx.report as never)})
    returning id::text
  `;
  await db()`delete from diagnose_reports where at < now() - interval '90 days'`;
  return { id: row!.id, outcome, report: ctx.report, ms };
}

export type SavedReport = {
  id: string;
  at: Date;
  by_email: string | null;
  component: string;
  outcome: Outcome;
  ms: number;
  report: DiagnoseReport;
};

export async function recentReports(limit = 10): Promise<Omit<SavedReport, "report">[]> {
  return db()<Omit<SavedReport, "report">[]>`
    select id::text, at, by_email, component, outcome, ms from diagnose_reports
    order by at desc limit ${limit}
  `;
}

export async function getReport(id: string): Promise<SavedReport | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db()<SavedReport[]>`
    select id::text, at, by_email, component, outcome, ms, report from diagnose_reports where id = ${id}
  `;
  return row ?? null;
}

/** The report as plain text, for the download. */
export function reportText(r: SavedReport): string {
  const name =
    r.component === "all"
      ? "Every part"
      : (COMPONENT_BY_ID[r.component as ComponentId]?.name ?? r.component);
  const lines = [
    `${site.name} · Diagnose & Fix report`,
    "",
    `Part:      ${name}`,
    `Result:    ${OUTCOME_LABEL[r.outcome]}`,
    `When:      ${new Date(r.at).toISOString()}`,
    `By:        ${r.by_email ?? "unknown"}`,
    `Took:      ${(r.ms / 1000).toFixed(1)} s`,
    `Version:   ${r.report.version}`,
    "",
    "Steps",
    "-----",
    ...r.report.steps.map(
      (s) =>
        `+${String((s.t / 1000).toFixed(1)).padStart(5)} s  [${s.kind.padEnd(5)}] ${s.status.toUpperCase().padEnd(7)} ${s.title}: ${s.detail}`,
    ),
  ];
  if (r.report.advice.length) {
    lines.push(
      "",
      "What you need to do",
      "-------------------",
      ...r.report.advice.map((a) => `- ${a}`),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Starts a fresh deployment through the Vercel Deploy Hook, when one is set. */
export async function triggerRedeploy(): Promise<{ ok: boolean; detail: string }> {
  const hook = env().DEPLOY_HOOK_URL;
  if (!hook) return { ok: false, detail: "No Deploy Hook is set (DEPLOY_HOOK_URL)" };
  try {
    const res = await fetch(hook, { method: "POST", cache: "no-store" });
    await res.body?.cancel();
    return res.ok
      ? { ok: true, detail: "Vercel started a new deployment. It takes about 2 minutes." }
      : { ok: false, detail: `Vercel answered ${res.status}` };
  } catch (e) {
    return { ok: false, detail: errText(e) };
  }
}
