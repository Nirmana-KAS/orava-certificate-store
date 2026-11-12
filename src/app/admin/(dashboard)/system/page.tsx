import type { Metadata } from "next";
import { headers } from "next/headers";

import { PageHeader } from "@/components/admin/page-header";
import {
  LiveChecks,
  ReportLink,
  SystemActions,
  SystemMap,
  StatusPill,
} from "@/components/admin/system-map";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatDuration } from "@/lib/format";
import { siteOrigin } from "@/lib/server/cron-auth";
import { OUTCOME_LABEL, recentReports } from "@/lib/server/diagnose";
import { env } from "@/lib/server/env";
import { latestRun, recentIncidents } from "@/lib/server/health";
import { requireAdmin } from "@/lib/server/session";
import {
  COMPONENT_BY_ID,
  mapStatuses,
  type ComponentId,
  type HealthResults,
} from "@/lib/system/map";

export const metadata: Metadata = { title: "System map" };

const partName = (id: string) =>
  id === "all" ? "Every part" : (COMPONENT_BY_ID[id as ComponentId]?.name ?? id);

export default async function SystemPage() {
  await requireAdmin();
  const [run, incidents, reports, h] = await Promise.all([
    latestRun(),
    recentIncidents(15),
    recentReports(10),
    headers(),
  ]);
  const results: HealthResults = run?.results ?? {};
  const statuses = mapStatuses(results);
  const open = incidents.filter((i) => i.status === "open");
  const openBy = Object.fromEntries(open.map((i) => [i.component, formatDateTime(i.started_at)]));
  const problems = (Object.keys(statuses) as ComponentId[]).filter((id) => statuses[id] === "fail");
  const attention = (Object.keys(statuses) as ComponentId[]).filter(
    (id) => statuses[id] === "warn",
  );
  const e = env();
  const origin = e.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || siteOrigin(h) || "https://your-site";

  const limits = Object.entries(results).flatMap(([id, r]) =>
    (r?.checks ?? [])
      .filter((c) => /free/i.test(c.name))
      .map((c) => ({
        part: partName(id),
        ...c,
        pct: Number(c.detail.match(/\((\d+)%\)/)?.[1] ?? 0),
      })),
  );

  return (
    <>
      <PageHeader
        title="System map"
        description="Every part of the system, how they connect and whether each one works right now. Checked every 5 minutes, and every minute while this page is open."
      />
      <LiveChecks runId={run?.id ?? null} />

      <div className="mb-6 grid gap-3" data-testid="system-overall">
        {!run ? (
          <Alert>Checking every part for the first time…</Alert>
        ) : problems.length ? (
          <Alert variant="error">
            <p className="font-medium">
              Not working: {problems.map((id) => COMPONENT_BY_ID[id].name).join(", ")}
            </p>
            <p>Tap the part for details, or press Diagnose & Fix.</p>
          </Alert>
        ) : attention.length ? (
          <Alert variant="warning">
            Needs attention: {attention.map((id) => COMPONENT_BY_ID[id].name).join(", ")}
          </Alert>
        ) : (
          <Alert variant="success">Everything works.</Alert>
        )}
        {run ? (
          <p className="text-sm text-muted-foreground" data-testid="last-check">
            Last checked {formatDateTime(run.at)} (
            {run.source === "cron"
              ? "scheduled"
              : run.source === "page"
                ? "while this page was open"
                : run.source === "diagnose"
                  ? "by Diagnose & Fix"
                  : "by hand"}
            , took {(run.ms / 1000).toFixed(1)} s)
          </p>
        ) : null}
        <SystemActions hasRedeploy={Boolean(e.DEPLOY_HOOK_URL)} />
      </div>

      <Card className="mb-6">
        <CardContent>
          <SystemMap results={results} incidents={openBy} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Free plan limits</CardTitle>
            <CardDescription>You get an alert at 95%.</CardDescription>
          </CardHeader>
          <CardContent>
            {limits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Shown after the first check.</p>
            ) : (
              <ul className="grid gap-4">
                {limits.map((l) => (
                  <li key={`${l.part}-${l.name}`} className="grid gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                      <span className="font-medium">
                        {l.part}: {l.name.replace(/ \(free.*\)$/i, "")}
                      </span>
                      <span className="text-muted-foreground">{l.detail}</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="meter"
                      aria-label={`${l.part} ${l.name}`}
                      aria-valuenow={l.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={
                          l.status === "fail"
                            ? "h-full bg-destructive"
                            : l.status === "warn"
                              ? "h-full bg-warning"
                              : "h-full bg-success"
                        }
                        style={{ width: `${Math.min(100, Math.max(1, l.pct))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Problems</CardTitle>
            <CardDescription>
              You get one email when a part stops working and one when it works again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No problems so far.</p>
            ) : (
              <ul className="grid gap-3" data-testid="incidents">
                {incidents.map((i) => (
                  <li
                    key={i.id}
                    className="grid gap-0.5 border-b pb-3 text-sm last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2">
                      <span className="font-medium">{partName(i.component)}</span>
                      <StatusPill status={i.status === "open" ? "fail" : "ok"} />
                    </div>
                    <span className="text-muted-foreground">
                      {formatDateTime(i.started_at)}
                      {i.resolved_at
                        ? ` · fixed after ${formatDuration(Math.max(60, (new Date(i.resolved_at).getTime() - new Date(i.started_at).getTime()) / 1000))}`
                        : " · still open"}
                    </span>
                    <span className="wrap-anywhere">{i.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Diagnose & Fix reports</CardTitle>
            <CardDescription>
              What was checked, what was fixed and what is left for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="grid gap-2" data-testid="reports">
                {reports.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 border-b pb-2 text-sm last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{partName(r.component)}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {OUTCOME_LABEL[r.outcome]} · {formatDateTime(r.at)}
                      </span>
                    </span>
                    <ReportLink id={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>
              So problems are found when nobody has this page open. All free.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div>
              <p className="font-medium">Checks every 5 minutes (cron-job.org)</p>
              <ol className="mt-1 ml-5 list-decimal space-y-1">
                <li>Sign up free at cron-job.org and press Create cronjob.</li>
                <li>
                  Address:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs wrap-anywhere">
                    {origin}/api/health/check
                  </code>
                </li>
                <li>Schedule: every 5 minutes.</li>
                <li>
                  Advanced → Headers: add{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">x-cron-secret</code> with
                  your CRON_SECRET from Vercel.
                </li>
              </ol>
              <p className="mt-1 text-muted-foreground">
                CRON_SECRET in Vercel: {e.CRON_SECRET ? "set" : "missing, add it first"}.
              </p>
              {/^https?:\/\/(localhost|127\.|192\.168\.|10\.)/.test(origin) ? (
                <p className="mt-1 text-warning">
                  This is your computer&apos;s address, which cron-job.org can&apos;t reach. Open
                  this page on your live Vercel site and use the address shown there.
                </p>
              ) : null}
              <p className="mt-1 text-muted-foreground">
                Opening the address in a browser shows &quot;Unauthorized&quot;. That&apos;s
                expected: only cron-job.org has the secret.
              </p>
            </div>
            <div>
              <p className="font-medium">Redeploy button (optional)</p>
              <p className="text-muted-foreground">
                {e.DEPLOY_HOOK_URL
                  ? "Set up. The Redeploy button starts a fresh deployment."
                  : "In Vercel: Project → Settings → Git → Deploy Hooks, create a hook for the main branch, and add its address as DEPLOY_HOOK_URL in Environment Variables."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
