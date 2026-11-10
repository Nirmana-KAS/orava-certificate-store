import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Download, FileSpreadsheet, FileText, SlidersHorizontal } from "lucide-react";

import { FilterFields } from "@/components/certificates/certificate-search";
import { PrintButton } from "@/components/reports/print-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { filtersHref, type Filters } from "@/lib/certificates/filters";
import {
  caratsText,
  cellText,
  COLUMNS,
  GROUPS,
  PREVIEW_LIMIT,
  reportQuery,
  type ColumnKey,
  type ReportOptions,
} from "@/lib/reports/report";
import { describeFilters } from "@/lib/server/report-export";
import { makeReport } from "@/lib/server/reports";
import { filterOptions } from "@/lib/server/search";

/**
 * Pick certificates with the search filters, choose columns and grouping, see the report, and
 * download it as PDF, Excel or CSV (or print it). Everything is in the page address, so a report
 * can be bookmarked and opened again with today's data.
 */
export async function ReportBuilder({
  filters: f,
  options: o,
  base,
  detailBase,
}: {
  filters: Filters;
  options: ReportOptions;
  base: string;
  detailBase: string;
}) {
  const [report, choices] = await Promise.all([makeReport(f, o, PREVIEW_LIMIT), filterOptions()]);
  const query = reportQuery(filtersHref(base, f), o);
  const exportHref = (format: string) => `/api/reports?${query}&format=${format}`;
  const described = describeFilters(f, choices);
  const grouped = o.group !== "none";

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <form
        key={`${base}?${query}`}
        method="get"
        action={base}
        className="grid gap-4 rounded-xl border p-4 print:hidden"
        aria-label="Report settings"
      >
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="grid gap-2">
            <Label htmlFor="title">Report title</Label>
            <Input id="title" name="title" defaultValue={o.title} maxLength={120} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group">Group by</Label>
            <Select id="group" name="group" defaultValue={o.group}>
              {Object.entries(GROUPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Columns</legend>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(COLUMNS) as ColumnKey[]).map((c) => (
              <label key={c} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="cols"
                  value={c}
                  defaultChecked={o.columns.includes(c)}
                  className="size-5 accent-primary"
                />
                {COLUMNS[c]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2">
          <Label htmlFor="q">Search words (optional)</Label>
          <Input id="q" name="q" type="search" defaultValue={f.q ?? ""} autoComplete="off" />
        </div>

        <details className="group rounded-xl border" open>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Which certificates, and in what order
            <ChevronRight
              className="ml-auto size-4 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <div className="grid gap-4 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterFields filters={f} options={choices} />
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          <Button type="submit">Show report</Button>
          <Button asChild variant="outline">
            <Link href={base}>Start again</Link>
          </Button>
        </div>
      </form>

      <section aria-labelledby="report-title" className="grid min-w-0 gap-4 [&>*]:min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap print:hidden">
          <Button asChild>
            <a href={exportHref("pdf")} download>
              <FileText /> Download PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={exportHref("xlsx")} download>
              <FileSpreadsheet /> Download Excel
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={exportHref("csv")} download>
              <Download /> Download CSV
            </a>
          </Button>
          <PrintButton />
        </div>

        <div className="rounded-xl border p-4 print:border-0 print:p-0">
          <div className="mb-4 flex items-start gap-4">
            <Image
              src="/brand/orava-logo.png"
              alt="Orava (Pvt) Ltd."
              width={120}
              height={39}
              className="hidden h-auto w-24 shrink-0 sm:block print:block"
            />
            <div className="min-w-0">
              <h2 id="report-title" className="text-xl font-semibold break-words">
                {o.title}
              </h2>
              <p className="text-sm break-words text-muted-foreground">{described.join(" · ")}</p>
              <p className="mt-1 text-sm font-medium" role="status">
                {report.count} certificate{report.count === 1 ? "" : "s"},{" "}
                {caratsText(report.carats)} in total
                {report.cut
                  ? `. Showing the first ${PREVIEW_LIMIT} here; the downloads include more.`
                  : ""}
              </p>
            </div>
          </div>

          {report.count === 0 ? (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              No certificates match. Change the filters above.
            </p>
          ) : (
            <>
              {/* On narrow screens the extra columns are off to the side; say so */}
              <p className="text-sm text-muted-foreground md:hidden print:hidden">
                Swipe the table sideways to see every column.
              </p>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Report table">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b bg-secondary text-left">
                      {o.columns.map((c) => (
                        <th key={c} scope="col" className="px-2 py-2 font-medium">
                          {COLUMNS[c]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {report.groups.map((g) => (
                    <tbody key={g.label}>
                      {grouped ? (
                        <tr className="border-b">
                          <th
                            scope="rowgroup"
                            colSpan={o.columns.length}
                            className="px-2 pt-4 pb-2 text-left font-semibold"
                          >
                            {g.label}{" "}
                            <span className="font-normal text-muted-foreground">
                              · {g.count} certificate{g.count === 1 ? "" : "s"} ·{" "}
                              {caratsText(g.carats)}
                            </span>
                          </th>
                        </tr>
                      ) : null}
                      {g.rows.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          {o.columns.map((c, i) => (
                            <td key={c} className="max-w-80 px-2 py-2 align-top break-words">
                              {i === 0 ? (
                                <Link
                                  href={`${detailBase}/${r.id}`}
                                  className="text-primary underline-offset-4 hover:underline print:text-foreground print:no-underline"
                                >
                                  {cellText(r, c) || "Open"}
                                </Link>
                              ) : (
                                cellText(r, c)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
