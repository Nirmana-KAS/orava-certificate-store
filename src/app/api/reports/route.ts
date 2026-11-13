import { NextResponse, type NextRequest } from "next/server";

import { parseFilters } from "@/lib/certificates/filters";
import { EXPORT_LIMIT, FORMATS, parseReportOptions, type Format } from "@/lib/reports/report";
import { audit } from "@/lib/server/audit";
import {
  describeFilters,
  fileNameFor,
  reportCsv,
  reportPdf,
  reportXlsx,
} from "@/lib/server/report-export";
import { canMakeReports, makeReport } from "@/lib/server/reports";
import { clientInfo } from "@/lib/server/request";
import { filterOptions } from "@/lib/server/search";
import { getSession } from "@/lib/server/session";
import { switchBlock, whoOf } from "@/lib/server/switches";

export const dynamic = "force-dynamic";

const TYPES: Record<Format, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

let logo: Uint8Array | null = null;

/** Downloads a report as PDF, Excel or CSV. Only for people allowed to make reports; logged. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!canMakeReports(session)) {
    return new NextResponse("You don't have permission to make reports.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const paused =
    (await switchBlock("search", whoOf(session))) ??
    (await switchBlock("download", whoOf(session)));
  if (paused) {
    return new NextResponse(paused.message, {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "Retry-After": "300" },
    });
  }
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const all: Record<string, string | string[]> = { ...params };
  const cols = request.nextUrl.searchParams.getAll("cols");
  if (cols.length) all.cols = cols;
  const format = (FORMATS as readonly string[]).includes(params.format ?? "")
    ? (params.format as Format)
    : "pdf";

  const filters = parseFilters(all);
  const options = parseReportOptions(all);
  const [report, choices] = await Promise.all([
    makeReport(filters, options, EXPORT_LIMIT),
    filterOptions(),
  ]);
  const info = {
    generatedBy: session!.user.name || session!.user.email,
    generatedAt: new Date(),
    filters: describeFilters(filters, choices),
  };

  let body: Buffer;
  if (format === "csv") body = reportCsv(report);
  else if (format === "xlsx") body = reportXlsx(report, info);
  else {
    if (!logo) {
      try {
        const res = await fetch(new URL("/brand/orava-logo.png", request.nextUrl.origin));
        if (res.ok) logo = new Uint8Array(await res.arrayBuffer());
      } catch {
        // The report is still made, without the logo
      }
    }
    body = await reportPdf(report, info, logo);
  }

  await audit(
    { id: session!.user.id, email: session!.user.email },
    "report.export",
    await clientInfo(),
    options.title,
    { format, certificates: report.count, filters: info.filters },
  );

  const name = fileNameFor(options.title, format, info.generatedAt);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
