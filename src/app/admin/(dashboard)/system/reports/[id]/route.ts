import { NextResponse } from "next/server";

import { audit } from "@/lib/server/audit";
import { getReport, reportText } from "@/lib/server/diagnose";
import { clientInfo } from "@/lib/server/request";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Downloads a Diagnose & Fix report as a text file (admin only). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.user.role !== "admin") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit(
    { id: session.user.id, email: session.user.email },
    "system.report",
    await clientInfo(),
    id,
  );
  const day = new Date(report.at).toISOString().slice(0, 16).replace(/[T:]/g, "-");
  return new NextResponse(reportText(report), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="orava-diagnose-${report.component}-${day}.txt"`,
      "Cache-Control": "private, no-store",
    },
  });
}
