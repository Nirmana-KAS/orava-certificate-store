import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ACTIVITY_PAGE_SIZE,
  KINDS,
  activityHref,
  parseActivityFilters,
  type Kind,
} from "@/lib/activity";
import { actionLabel, formatDateTime } from "@/lib/format";
import { activityPeople, findActivity } from "@/lib/server/activity";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Activity log" };

const BASE = "/admin/activity";

/** The details saved with an entry, as short "name: value" lines. */
function details(meta: Record<string, unknown>): string[] {
  return Object.entries(meta ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      const value = Array.isArray(v)
        ? v.join(", ")
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
      return `${k.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}: ${value}`;
    });
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const f = parseActivityFilters(await searchParams);
  const [{ rows, total }, people] = await Promise.all([
    findActivity(f, ACTIVITY_PAGE_SIZE, (f.page - 1) * ACTIVITY_PAGE_SIZE),
    activityPeople(),
  ]);
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const filtered = !!(f.q || f.who || f.kind || f.from || f.to);
  const first = total === 0 ? 0 : (f.page - 1) * ACTIVITY_PAGE_SIZE + 1;
  const last = Math.min(total, f.page * ACTIVITY_PAGE_SIZE);
  const csv = activityHref("/api/activity", { ...f, page: 1 });

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Who did what, and when: sign-ins, views and downloads, changes, reports and settings."
      />

      <form
        key={activityHref(BASE, f)}
        method="get"
        action={BASE}
        role="search"
        aria-label="Filter the activity log"
        className="mb-6 grid gap-4 rounded-xl border p-4"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2 md:col-span-2 xl:col-span-1">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={f.q ?? ""}
              placeholder="Certificate, email, IP…"
              autoComplete="off"
            />
          </div>
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
          <div className="grid gap-2">
            <Label htmlFor="kind">Kind</Label>
            <Select id="kind" name="kind" defaultValue={f.kind ?? ""}>
              <option value="">Everything</option>
              {(Object.keys(KINDS) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KINDS[k].label}
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
          {total > 0 ? (
            <Button asChild variant="outline" className="w-full sm:ml-auto sm:w-auto">
              <a href={csv} download>
                <Download /> Download CSV
              </a>
            </Button>
          ) : null}
        </div>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" role="status">
        {total === 0
          ? filtered
            ? "Nothing matches these filters."
            : "Nothing has been logged yet."
          : `Showing ${first}–${last} of ${total.toLocaleString("en-GB")} entr${total === 1 ? "y" : "ies"}.`}
      </p>

      {rows.length > 0 ? (
        <ul className="grid gap-2" data-testid="activity">
          {rows.map((r) => {
            const extra = details(r.meta);
            return (
              <li key={r.id}>
                <Card className="gap-2 py-3">
                  <CardContent className="grid gap-1 text-sm sm:grid-cols-[11rem_1fr] sm:gap-x-4">
                    <time
                      dateTime={new Date(r.at).toISOString()}
                      className="text-muted-foreground tabular-nums"
                    >
                      {formatDateTime(r.at)}
                    </time>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {actionLabel(r.action)}
                        {r.target ? (
                          <span className="font-normal wrap-anywhere text-muted-foreground">
                            {" "}
                            · {r.target}
                          </span>
                        ) : null}
                      </p>
                      <p className="wrap-anywhere text-muted-foreground">
                        {r.actor_email ? (
                          <Link
                            href={activityHref(BASE, { page: 1, who: r.actor_email })}
                            className="underline-offset-4 hover:underline"
                          >
                            {r.actor_email}
                          </Link>
                        ) : (
                          "System"
                        )}
                        {r.ip ? ` · ${r.ip}` : ""}
                      </p>
                      {extra.length > 0 || r.user_agent ? (
                        <details className="mt-1">
                          <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary">
                            Details
                          </summary>
                          <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                            {extra.map((d) => (
                              <li key={d} className="wrap-anywhere">
                                {d}
                              </li>
                            ))}
                            {r.user_agent ? (
                              <li className="wrap-anywhere">Browser: {r.user_agent}</li>
                            ) : null}
                            <li>Action code: {r.action}</li>
                          </ul>
                        </details>
                      ) : null}
                    </div>
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
