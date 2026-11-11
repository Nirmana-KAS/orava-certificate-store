import { NextResponse, type NextRequest } from "next/server";

import { ACTIVITY_EXPORT_LIMIT, parseActivityFilters } from "@/lib/activity";
import { actionLabel } from "@/lib/format";
import { findActivity } from "@/lib/server/activity";
import { audit } from "@/lib/server/audit";
import { csvLine } from "@/lib/server/csv";
import { clientInfo } from "@/lib/server/request";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** The activity log as CSV, with the same filters as the page. Admin only; logged. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session?.user.role !== "admin") {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const f = parseActivityFilters(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const { rows, total } = await findActivity(f, ACTIVITY_EXPORT_LIMIT);

  const lines = [
    csvLine(["Time (UTC)", "Person", "What", "Action code", "Target", "IP", "Browser", "Details"]),
    ...rows.map((r) =>
      csvLine([
        new Date(r.at).toISOString(),
        r.actor_email ?? "System",
        actionLabel(r.action),
        r.action,
        r.target ?? "",
        r.ip ?? "",
        r.user_agent ?? "",
        Object.keys(r.meta ?? {}).length ? JSON.stringify(r.meta) : "",
      ]),
    ),
  ];
  await audit(
    { id: session.user.id, email: session.user.email },
    "activity.export",
    await clientInfo(),
    `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`,
    { filters: { ...f, page: undefined }, total },
  );

  const day = new Date().toISOString().slice(0, 10);
  // The BOM lets Excel read the file as UTF-8
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Activity_log_${day}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
