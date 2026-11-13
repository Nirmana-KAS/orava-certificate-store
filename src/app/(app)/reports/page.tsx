import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SwitchNoticePage } from "@/components/layout/switch-notice";
import { ReportBuilder } from "@/components/reports/report-builder";
import { parseFilters } from "@/lib/certificates/filters";
import { parseReportOptions } from "@/lib/reports/report";
import { canMakeReports } from "@/lib/server/reports";
import { requireUser } from "@/lib/server/session";
import { switchBlock, whoOf } from "@/lib/server/switches";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireUser();
  if (session.user.role === "admin") redirect("/admin/reports");
  if (!canMakeReports(session)) redirect("/certificates");
  // Reports are exports: they stop with Search or with Downloads
  const paused =
    (await switchBlock("search", whoOf(session))) ??
    (await switchBlock("download", whoOf(session)));
  if (paused) return <SwitchNoticePage block={paused} what="Reports" />;
  const params = await searchParams;
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl print:hidden">Reports</h1>
      <p className="mt-1 mb-6 text-muted-foreground print:hidden">
        Choose certificates, columns and grouping, then download the report or print it.
      </p>
      <ReportBuilder
        filters={parseFilters(params)}
        options={parseReportOptions(params)}
        base="/reports"
        detailBase="/certificates"
      />
    </div>
  );
}
