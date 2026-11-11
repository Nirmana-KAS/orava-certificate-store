import { NextResponse, type NextRequest } from "next/server";

import { ACTIVITY_EXPORT_LIMIT, metaDetails, parseActivityFilters } from "@/lib/activity";
import { describeDevice, describePlace } from "@/lib/client-info";
import { actionLabel, formatDateTime } from "@/lib/format";
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
    csvLine([
      "Time (Sri Lanka)",
      "Person",
      "What",
      "About",
      "Browser",
      "System",
      "Device",
      "Location",
      "Map",
      "IP address",
      "Details",
    ]),
    ...rows.map((r) => {
      const d = r.user_agent ? describeDevice(r.user_agent, r.client) : null;
      const place = describePlace(r.ip, r.client, r.geo, r.geo_status);
      return csvLine([
        formatDateTime(r.at),
        r.actor_email ?? "System (automatic)",
        actionLabel(r.action),
        r.target ?? "",
        d?.browser ?? "",
        d?.system ?? "",
        d?.device ?? "",
        r.ip || place.known
          ? `${place.text}${place.kind === "exact" ? ` (exact, ${place.accuracy?.toLowerCase()})` : place.kind === "approximate" ? " (approximate)" : ""}`
          : "",
        place.mapUrl ?? "",
        r.ip ?? "",
        metaDetails(r.meta)
          .map((m) => `${m.label}: ${m.value}`)
          .join("; "),
      ]);
    }),
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
