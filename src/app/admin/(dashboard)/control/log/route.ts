import { NextResponse } from "next/server";

import { controlUnlockedUntil } from "@/lib/server/control";
import { csvLine } from "@/lib/server/csv";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** The Control Center change log as CSV. Admin only, with the Control Center unlocked. */
export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return new NextResponse("Not found", { status: 404, headers: noStore });
  }
  if (!(await controlUnlockedUntil(session))) {
    return new NextResponse("Unlock the Control Center first.", { status: 403, headers: noStore });
  }
  const rows = await db()<
    {
      at: Date;
      by: string | null;
      action: string;
      target: string | null;
      reason: string | null;
      ip: string | null;
      meta: Record<string, unknown>;
    }[]
  >`
    select at, actor_email as by, action, target, meta->>'reason' as reason, ip, meta
    from audit_logs where action like 'control.%' order by at desc limit 5000
  `;
  const lines = [
    csvLine(["Time (UTC)", "By", "Action", "What", "Reason", "IP", "Details"]),
    ...rows.map((r) =>
      csvLine([
        r.at.toISOString(),
        r.by ?? "Automatic",
        r.action,
        r.target ?? "",
        r.reason ?? "",
        r.ip ?? "",
        JSON.stringify(r.meta),
      ]),
    ),
  ];
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="control-center-log_${day}.csv"`,
    },
  });
}
