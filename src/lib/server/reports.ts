import "server-only";

import type { Filters } from "@/lib/certificates/filters";
import { buildReport, type Report, type ReportOptions, type ReportRow } from "@/lib/reports/report";

import { searchCertificates } from "./search";
import type { Session } from "./session";

/** Reports are for the admin and for staff the admin allowed to make them. */
export function canMakeReports(session: Session | null): boolean {
  return !!session && (session.user.role === "admin" || session.user.canReport);
}

/** The report for these filters and options, with at most `limit` certificates. */
export async function makeReport(
  filters: Filters,
  options: ReportOptions,
  limit: number,
): Promise<Report> {
  // One more than the limit tells us whether the list was cut short
  const { rows } = await searchCertificates(filters, { limit: limit + 1 });
  const cut = rows.length > limit;
  const list: ReportRow[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    report_no: r.report_no,
    report_date: r.report_date_iso,
    lab: r.lab,
    type: r.type_name,
    category: r.category,
    stone: r.identification,
    weight: r.weight_ct === null ? null : Number(r.weight_ct),
    origin: r.origin,
    customer: r.customer,
    files: r.files,
    summary: r.summary,
  }));
  return buildReport(list, options, cut);
}
