import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildReport, cellText, parseReportOptions, type ReportRow } from "@/lib/reports/report";
import { reportCsv, reportPdf, reportXlsx } from "@/lib/server/report-export";

const row = (over: Partial<ReportRow>): ReportRow => ({
  id: crypto.randomUUID(),
  report_no: "A1",
  report_date: "2026-06-10",
  lab: "AIGS",
  type: "AIGS Individual Gem Stone Report",
  category: "individual",
  stone: "Ruby",
  weight: 1.5,
  origin: "Burma",
  customer: null,
  files: 1,
  summary: "",
  ...over,
});

const info = { generatedBy: "Tester", generatedAt: new Date("2026-11-10T10:00:00Z"), filters: [] };

describe("reports", () => {
  it("reads options with sensible defaults", () => {
    const o = parseReportOptions({ cols: ["weight", "nonsense", "report_no"], group: "bad" });
    expect(o.columns).toEqual(["report_no", "weight"]);
    expect(o.group).toBe("none");
    expect(o.title).toBe("Certificate report");
  });

  it("groups by month, newest first, with counts and carats", () => {
    const r = buildReport(
      [
        row({ report_date: "2026-05-02", weight: 1.25 }),
        row({ report_date: "2026-06-10", weight: 2 }),
        row({ report_date: "2026-06-11", weight: 0.5 }),
      ],
      { title: "T", columns: ["report_no"], group: "month" },
      false,
    );
    expect(r.groups.map((g) => [g.label, g.count, g.carats])).toEqual([
      ["June 2026", 2, 2.5],
      ["May 2026", 1, 1.25],
    ]);
    expect(r.carats).toBe(3.75);
    expect(cellText(r.groups[0]!.rows[0]!, "report_date")).toBe("10 Jun 2026");
  });

  it("makes CSV that spreadsheets can't run as formulas", () => {
    const r = buildReport(
      [row({ customer: "=HYPERLINK(1)", summary: 'Says "hi", ok' })],
      { title: "T", columns: ["customer", "summary"], group: "none" },
      false,
    );
    const text = reportCsv(r).toString("utf8");
    expect(text).toContain("'=HYPERLINK(1)");
    expect(text).toContain('"Says ""hi"", ok"');
  });

  it("makes a real .xlsx (zip) and a PDF", async () => {
    const r = buildReport(
      [row({ origin: "Ceylon & Co <x>" }), row({ stone: "Émeraude" })],
      { title: "Test", columns: ["report_no", "stone", "weight", "origin"], group: "lab" },
      false,
    );
    const x = reportXlsx(r, info);
    expect(x.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const pdf = await reportPdf(r, info, null);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
