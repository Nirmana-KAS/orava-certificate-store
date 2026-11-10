import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { ReportBuilder } from "@/components/reports/report-builder";
import { parseFilters } from "@/lib/certificates/filters";
import { parseReportOptions } from "@/lib/reports/report";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          description="Choose certificates, columns and grouping, then download the report or print it. Staff with “Can make reports” have the same page."
        />
      </div>
      <ReportBuilder
        filters={parseFilters(params)}
        options={parseReportOptions(params)}
        base="/admin/reports"
        detailBase="/admin/certificates"
      />
    </>
  );
}
