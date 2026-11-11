import "server-only";

/** One CSV cell. A spreadsheet can't run a cell typed as =, +, - or @ when it is opened. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(",");
}
