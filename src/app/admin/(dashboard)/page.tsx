import type { Metadata } from "next";
import Link from "next/link";
import { Activity, KeyRound, ShieldAlert, Users } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { actionLabel, formatDateTime } from "@/lib/format";
import { db } from "@/lib/server/db";
import { backupDue, backupSummary } from "@/lib/server/backup";
import { getSettings } from "@/lib/server/settings";
import { trashCount } from "@/lib/server/trash";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Admin overview" };

type Stats = { staff: number; sessions: number; failed: number; events: number };

const severityVariant = {
  info: "muted",
  low: "default",
  medium: "warning",
  high: "danger",
  critical: "danger",
} as const;

export default async function AdminOverviewPage() {
  await requireAdmin();
  const sql = db();
  const [[stats], activity, events, settings, backup, trash] = await Promise.all([
    sql<Stats[]>`
      select
        (select count(*)::int from app_users where role = 'viewer' and status = 'active') as staff,
        (select count(*)::int from sessions where revoked_at is null and expires_at > now()) as sessions,
        (select count(*)::int from login_attempts where success = false and at > now() - interval '24 hours') as failed,
        (select count(*)::int from security_events where severity in ('medium','high','critical')
           and at > now() - interval '24 hours') as events
    `,
    sql<
      { id: number; actor_email: string | null; action: string; target: string | null; at: Date }[]
    >`
      select id, actor_email, action, target, at from audit_logs order by at desc limit 12
    `,
    sql<
      {
        id: number;
        kind: string;
        severity: keyof typeof severityVariant;
        ip: string | null;
        email: string | null;
        at: Date;
      }[]
    >`
      select id, kind, severity, ip, email, at from security_events
      where severity <> 'info' order by at desc limit 8
    `,
    getSettings(),
    backupSummary(),
    trashCount(),
  ]);

  const tiles = [
    { label: "Active staff", value: stats?.staff ?? 0, icon: Users },
    { label: "Signed-in sessions", value: stats?.sessions ?? 0, icon: KeyRound },
    { label: "Failed sign-ins (24h)", value: stats?.failed ?? 0, icon: Activity },
    { label: "Security alerts (24h)", value: stats?.events ?? 0, icon: ShieldAlert },
  ];

  return (
    <>
      <PageHeader title="Overview" description="Sign-in activity and security at a glance." />

      {settings.lockdown ? (
        <Alert variant="warning" className="mb-6">
          Lockdown is on. Staff can&apos;t sign in until you turn it off in Settings.
        </Alert>
      ) : null}
      {backupDue(backup) ? (
        <Alert variant="warning" className="mb-6">
          {backup.lastBackup ? "No backup in the last 7 days. " : "No backup has been made yet. "}
          <Link href="/admin/backup">Download a backup</Link>
        </Alert>
      ) : null}
      {trash > 0 ? (
        <Alert className="mb-6">
          {trash} deleted certificate{trash === 1 ? " is" : "s are"} in the Trash.{" "}
          <Link href="/admin/trash">Review the Trash</Link>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="gap-2 py-4">
            <CardContent className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
              <Icon className="size-6 text-primary" aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Recent activity</CardTitle>
            <Link
              href="/admin/activity"
              className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
            >
              See all activity
            </Link>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y">
                {activity.map((a) => (
                  <li key={a.id} className="grid gap-0.5 py-3 text-sm">
                    <span className="font-medium">
                      {actionLabel(a.action)}
                      {a.target ? (
                        <span className="font-normal text-muted-foreground"> · {a.target}</span>
                      ) : null}
                    </span>
                    <span className="wrap-anywhere text-muted-foreground">
                      {a.actor_email ?? "System"} · {formatDateTime(a.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security events</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No warnings. All quiet.</p>
            ) : (
              <ul className="divide-y">
                {events.map((e) => (
                  <li key={e.id} className="grid gap-1 py-3 text-sm">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      <Badge variant={severityVariant[e.severity]}>{e.severity}</Badge>
                      {e.kind.replaceAll("_", " ")}
                    </span>
                    <span className="wrap-anywhere text-muted-foreground">
                      {[e.email, e.ip].filter(Boolean).join(" · ") || "Unknown source"} ·{" "}
                      {formatDateTime(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
