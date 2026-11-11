import "server-only";

import { crc32, deflateRawSync } from "node:zlib";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { SORTS, type Filters } from "@/lib/certificates/filters";
import { CATEGORY_LABELS } from "@/lib/labs";
import { caratsText, cellText, COLUMNS, GROUPS, type Report } from "@/lib/reports/report";
import { xlsxParts, type XRow } from "@/lib/xlsx";

import { csvCell } from "./csv";
import type { FilterOptions } from "./search";

// Turns a report into a file: CSV (any spreadsheet), Excel (.xlsx) or PDF with the Orava logo.
// All three are made here on the server without paid services.

/** The filters in plain words, printed under the title so a report explains itself. */
export function describeFilters(f: Filters, o: FilterOptions): string[] {
  const out: string[] = [];
  if (f.q) out.push(`Search: "${f.q}"`);
  if (f.lab) out.push(`Lab: ${o.labs.find((l) => l.id === f.lab)?.name ?? "?"}`);
  if (f.category) out.push(CATEGORY_LABELS[f.category]);
  if (f.type) out.push(`Type: ${o.types.find((t) => t.id === f.type)?.name ?? "?"}`);
  if (f.gem) out.push(`Stone: ${f.gem}`);
  if (f.origin) out.push(`Origin: ${f.origin}`);
  if (f.from || f.to) out.push(`Dates: ${f.from ?? "any"} to ${f.to ?? "any"}`);
  if (f.min !== undefined || f.max !== undefined)
    out.push(`Carats: ${f.min ?? 0} to ${f.max ?? "any"}`);
  out.push(
    `Sorted by ${SORTS[f.sort].toLowerCase()}${f.then ? `, then ${SORTS[f.then].toLowerCase()}` : ""}`,
  );
  return out;
}

export type ExportInfo = { generatedBy: string; generatedAt: Date; filters: string[] };

const stamp = (d: Date) =>
  d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });

/** A safe file name from the report title. */
export function fileNameFor(title: string, ext: string, at: Date): string {
  const base =
    title
      .replace(/[^A-Za-z0-9 _-]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60) || "Report";
  return `${base}_${at.toISOString().slice(0, 10)}.${ext}`;
}

// ── CSV ──────────────────────────────────────────────────────────────────────────

export function reportCsv(r: Report): Buffer {
  const cols = r.options.columns;
  const grouped = r.options.group !== "none";
  const lines: string[] = [];
  lines.push(
    [...(grouped ? [GROUPS[r.options.group]] : []), ...cols.map((c) => COLUMNS[c])]
      .map(csvCell)
      .join(","),
  );
  for (const g of r.groups) {
    for (const row of g.rows) {
      lines.push(
        [...(grouped ? [g.label] : []), ...cols.map((c) => cellText(row, c))]
          .map(csvCell)
          .join(","),
      );
    }
  }
  // The BOM lets Excel read the file as UTF-8 (names with accents stay right)
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

// ── Excel (.xlsx) ──────────────────────────────────────────────────────────────────

/** A zip file (the .xlsx container) from a few named files. */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const packed = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(f.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

export function reportXlsx(r: Report, info: ExportInfo): Buffer {
  const cols = r.options.columns;
  const rows: XRow[] = [];
  rows.push({ cells: [r.options.title], bold: true });
  rows.push({ cells: [`Made ${stamp(info.generatedAt)} by ${info.generatedBy}`] });
  rows.push({ cells: [info.filters.join(" · ")] });
  rows.push({
    cells: [`${r.count} certificate${r.count === 1 ? "" : "s"}, ${caratsText(r.carats)}`],
  });
  rows.push({ cells: [] });
  rows.push({ cells: cols.map((c) => COLUMNS[c]), bold: true });
  for (const g of r.groups) {
    if (r.options.group !== "none") {
      rows.push({
        cells: [
          `${g.label}: ${g.count} certificate${g.count === 1 ? "" : "s"}, ${caratsText(g.carats)}`,
        ],
        bold: true,
      });
    }
    for (const row of g.rows) {
      rows.push({
        cells: cols.map((c) =>
          c === "weight" && row.weight !== null
            ? row.weight
            : c === "files"
              ? row.files
              : cellText(row, c),
        ),
      });
    }
  }
  const widths = cols.map((c) =>
    c === "summary" ? 60 : c === "type" ? 36 : c === "weight" || c === "files" ? 10 : 20,
  );
  const parts = xlsxParts([{ name: "Report", rows, widths, freezeRows: 6 }]);
  return zip(parts.map((f) => ({ name: f.name, data: Buffer.from(f.data, "utf8") })));
}

// ── PDF ──────────────────────────────────────────────────────────────────────────

/** The standard PDF font covers Western European letters; anything else becomes "?". */
const pdfSafe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let t = pdfSafe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

const WEIGHTS: Record<string, number> = {
  report_no: 1.3,
  report_date: 1.1,
  lab: 1,
  type: 2.4,
  category: 1.5,
  stone: 1.8,
  weight: 0.8,
  origin: 1.2,
  customer: 1.6,
  files: 0.6,
  summary: 3.2,
};

/** `logoPng` is the Orava logo (left out if it couldn't be loaded). */
export async function reportPdf(
  r: Report,
  info: ExportInfo,
  logoPng: Uint8Array | null,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(r.options.title);
  doc.setAuthor("Orava (Pvt) Ltd.");
  doc.setProducer("Orava Certificate Store");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = logoPng ? await doc.embedPng(logoPng).catch(() => null) : null;

  // A4 landscape, so more columns fit
  const W = 842;
  const H = 595;
  const M = 36;
  const cols = r.options.columns;
  const total = cols.reduce((s, c) => s + (WEIGHTS[c] ?? 1), 0);
  const widths = cols.map((c) => ((W - 2 * M) * (WEIGHTS[c] ?? 1)) / total);
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.85, 0.87, 0.9);
  const band = rgb(0.93, 0.95, 0.98);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const header = (first: boolean) => {
    if (first) {
      const lh = 34;
      const lw = logo ? (logo.width / logo.height) * lh : -16;
      if (logo) page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
      page.drawText(fit(r.options.title, bold, 16, W - 2 * M - lw - 20), {
        x: M + lw + 16,
        y: y - 14,
        size: 16,
        font: bold,
        color: ink,
      });
      page.drawText(pdfSafe(`Made ${stamp(info.generatedAt)} by ${info.generatedBy}`), {
        x: M + lw + 16,
        y: y - 30,
        size: 9,
        font,
        color: muted,
      });
      y -= lh + 14;
      for (const t of [
        info.filters.join("  ·  "),
        `${r.count} certificate${r.count === 1 ? "" : "s"}, ${caratsText(r.carats)} in total${r.cut ? " (list cut at the limit; narrow the filters)" : ""}`,
      ]) {
        page.drawText(fit(t, font, 9, W - 2 * M), { x: M, y, size: 9, font, color: muted });
        y -= 13;
      }
      y -= 4;
    }
    // Column headings
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 18, color: band });
    let x = M;
    cols.forEach((c, i) => {
      page.drawText(fit(COLUMNS[c], bold, 8.5, widths[i]! - 6), {
        x: x + 3,
        y: y - 11,
        size: 8.5,
        font: bold,
        color: ink,
      });
      x += widths[i]!;
    });
    y -= 20;
  };

  const ensure = (needed: number) => {
    if (y - needed < M + 18) {
      page = doc.addPage([W, H]);
      y = H - M;
      header(false);
    }
  };

  header(true);
  for (const g of r.groups) {
    if (r.options.group !== "none") {
      ensure(30);
      y -= 4;
      page.drawText(
        fit(
          `${g.label}  -  ${g.count} certificate${g.count === 1 ? "" : "s"}, ${caratsText(g.carats)}`,
          bold,
          9.5,
          W - 2 * M,
        ),
        { x: M, y: y - 10, size: 9.5, font: bold, color: ink },
      );
      y -= 16;
    }
    for (const row of g.rows) {
      ensure(14);
      let x = M;
      cols.forEach((c, i) => {
        page.drawText(fit(cellText(row, c), font, 8.5, widths[i]! - 6), {
          x: x + 3,
          y: y - 10,
          size: 8.5,
          font,
          color: ink,
        });
        x += widths[i]!;
      });
      page.drawLine({
        start: { x: M, y: y - 14 },
        end: { x: W - M, y: y - 14 },
        thickness: 0.5,
        color: line,
      });
      y -= 15;
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Orava (Pvt) Ltd.  ·  Confidential  ·  Page ${i + 1} of ${pages.length}`, {
      x: M,
      y: M - 14,
      size: 8,
      font,
      color: muted,
    });
  });
  return Buffer.from(await doc.save());
}
