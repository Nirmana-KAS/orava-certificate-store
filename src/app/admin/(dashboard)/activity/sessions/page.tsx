import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { ActivityTabs } from "@/components/admin/activity-tabs";
import { Facts, PlaceLink, type Fact } from "@/components/admin/client-facts";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { activityHref, parseActivityFilters } from "@/lib/activity";
import { describeDevice } from "@/lib/client-info";
import { actionLabel, formatDateTime, formatDuration } from "@/lib/format";
import { activityPeople } from "@/lib/server/activity";
import { requireAdmin } from "@/lib/server/session";
import { findSessions, sessionActions, type SessionEnd } from "@/lib/server/sessions-history";

export const metadata: Metadata = { title: "Sign-in sessions" };

const BASE = "/admin/activity/sessions";
const PAGE_SIZE = 25;

const ENDS: Record<SessionEnd, { label: string; variant: "success" | "muted" | "warning" }> = {
  active: { label: "Signed in now", variant: "success" },
  signed_out: { label: "Signed out", variant: "muted" },
  ended_by_admin: { label: "Ended by the admin", variant: "warning" },
  expired: { label: "Ran out", variant: "muted" },
  ended: { label: "Ended", variant: "muted" },
};

const timeOnly = (d: Date) => formatDateTime(d).split(", ")[1] ?? "";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const f = parseActivityFilters(await searchParams);
  const [{ rows, total, seconds }, people] = await Promise.all([
    findSessions(f, PAGE_SIZE, (f.page - 1) * PAGE_SIZE),
    activityPeople(),
  ]);
  const actions = await sessionActions(rows.map((r) => r.id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(f.who || f.from || f.to);

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every sign-in: when it started and ended, how long it lasted, where it was and what was done."
      />
      <ActivityTabs current="sessions" />

      <form
        key={activityHref(BASE, f)}
        method="get"
        action={BASE}
        role="search"
        aria-label="Filter sign-in sessions"
        className="mb-6 grid gap-4 rounded-xl border p-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="who">Person</Label>
            <Select id="who" name="who" defaultValue={f.who ?? ""}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div className="@container">
            <div className="grid gap-3 @xs:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="from">Date from</Label>
                <Input id="from" name="from" type="date" defaultValue={f.from ?? ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="to">Date to</Label>
                <Input id="to" name="to" type="date" defaultValue={f.to ?? ""} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:flex sm:flex-wrap">
          <Button type="submit" className="w-full sm:w-auto">
            <Search /> Show
          </Button>
          {filtered ? (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href={BASE}>Clear filters</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" role="status" data-testid="sessions-total">
        {total === 0
          ? "No sign-ins match."
          : `${total.toLocaleString("en-GB")} sign-in${total === 1 ? "" : "s"}, ${formatDuration(seconds)} signed in in total.`}
      </p>

      {rows.length > 0 ? (
        <ul className="grid gap-3" data-testid="sessions">
          {rows.map((r) => {
            const d = r.user_agent ? describeDevice(r.user_agent, r.client) : null;
            const end = ENDS[r.how];
            const done = actions.get(r.id) ?? [];
            const facts: Fact[] = [
              { label: "Signed in", value: formatDateTime(r.started) },
              {
                label: r.how === "active" ? "Last active" : "Ended",
                value:
                  r.how === "active"
                    ? formatDateTime(r.lastActive)
                    : r.how === "expired" || r.how === "ended"
                      ? `${formatDateTime(r.ended)} (last action)`
                      : formatDateTime(r.ended),
              },
              {
                label: "Time signed in",
                value: (
                  <span className="font-medium">
                    {formatDuration(r.seconds)}
                    {r.how === "active" ? " so far" : ""}
                  </span>
                ),
              },
              {
                label: "Location",
                value: (
                  <PlaceLink
                    ip={r.ip}
                    meta={r.client}
                    geo={r.geo}
                    status={r.geo_status}
                    label={`sign-in of ${r.email} at ${formatDateTime(r.started)}`}
                  />
                ),
              },
              ...(d
                ? [
                    { label: "Using", value: `${d.browser} on ${d.system}` },
                    { label: "Device", value: d.device },
                  ]
                : []),
              ...(r.ip ? [{ label: "IP address", value: r.ip }] : []),
            ];
            return (
              <li key={r.id}>
                <Card className="gap-3 py-4">
                  <CardContent className="grid gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={activityHref(BASE, { page: 1, who: r.email })}
                        className="font-medium wrap-anywhere text-primary underline-offset-4 hover:underline"
                      >
                        {r.email}
                      </Link>
                      {r.role === "admin" ? <Badge>Admin</Badge> : null}
                      <Badge variant={end.variant}>{end.label}</Badge>
                    </div>
                    <Facts facts={facts} />
                    <details className="group">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary">
                        What was done ({done.length})
                      </summary>
                      {done.length === 0 ? (
                        <p className="text-muted-foreground">Nothing was logged.</p>
                      ) : (
                        <ol className="mt-1 grid gap-1 border-l pl-3">
                          {done.map((a, i) => (
                            <li
                              key={`${a.at.toString()}-${i}`}
                              className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2"
                            >
                              <time
                                dateTime={new Date(a.at).toISOString()}
                                className="text-muted-foreground tabular-nums"
                              >
                                {timeOnly(a.at)}
                              </time>
                              <span className="wrap-anywhere">
                                {actionLabel(a.action)}
                                {a.target ? (
                                  <span className="text-muted-foreground"> · {a.target}</span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </details>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-2">
          {f.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={activityHref(BASE, f, { page: f.page - 1 })}>
                <ChevronLeft /> Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {Math.min(f.page, pages)} of {pages}
          </span>
          {f.page < pages ? (
            <Button asChild variant="outline">
              <Link href={activityHref(BASE, f, { page: f.page + 1 })}>
                Next <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
