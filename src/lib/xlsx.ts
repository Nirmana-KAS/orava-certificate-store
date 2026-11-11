// Builds the files inside an Excel workbook (.xlsx). The caller zips them: the server with
// Node's zlib (report downloads), the browser with the backup's zip writer. No imports, so it
// runs in both places.

export type XCell = string | number | null | undefined;
export type XRow = { cells: XCell[]; bold?: boolean };
export type XSheet = {
  name: string;
  rows: XRow[];
  /** Column widths in characters */
  widths?: number[];
  /** Rows kept on screen while scrolling (e.g. 1 for a header row) */
  freezeRows?: number;
  /** Adds Excel's filter buttons on this row (1-based), usually the header */
  filterRow?: number;
};

const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A, B, … Z, AA, AB, … */
export function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel's rules for sheet names: 31 characters, none of []:*?/\, and unique. */
/** Shortens at a word break, so "AIGS Individual Gem Stone Report" becomes "AIGS Individual Gem Stone". */
function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1).lastIndexOf(" ");
  return (cut >= max / 2 ? s.slice(0, cut) : s.slice(0, max)).trim();
}

/** Excel's rules for sheet names: 31 characters, none of []:*?/\\, and unique. */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const clean = raw
      .replace(/[[\]:*?/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const base = shorten(clean, 31) || "Sheet";
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      const suffix = ` (${i})`;
      name = shorten(base, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Excel shows at most 32,767 characters in a cell. */
const MAX_CELL = 32_000;

function sheetXml(s: XSheet): string {
  const rows = s.rows
    .map((row, i) => {
      const cells = row.cells
        .map((cell, j) => {
          if (cell === null || cell === undefined || cell === "") return "";
          const ref = `${colName(j)}${i + 1}`;
          const style = row.bold ? ' s="1"' : "";
          if (typeof cell === "number") {
            return Number.isFinite(cell) ? `<c r="${ref}"${style}><v>${cell}</v></c>` : "";
          }
          const text = cell.length > MAX_CELL ? `${cell.slice(0, MAX_CELL)}…` : cell;
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${i + 1}">${cells}</row>`;
    })
    .join("");
  const widths = (s.widths ?? [])
    .map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const freeze = s.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${s.freezeRows}" topLeftCell="A${s.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const width = Math.max(1, ...s.rows.map((r) => r.cells.length));
  const filter =
    s.filterRow && s.rows.length > s.filterRow
      ? `<autoFilter ref="A${s.filterRow}:${colName(width - 1)}${s.rows.length}"/>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${widths ? `<cols>${widths}</cols>` : ""}<sheetData>${rows}</sheetData>${filter}</worksheet>`;
}

/** The named files of a workbook, ready to be zipped. */
export function xlsxParts(sheets: XSheet[]): { name: string; data: string }[] {
  const names = sheetNames(sheets.map((s) => s.name));
  const overrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const sheetList = names
    .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  const rels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");
  return [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetList}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
}
