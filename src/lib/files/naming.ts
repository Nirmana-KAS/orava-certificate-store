// The standard name of every stored certificate file: ReportNo_Date_Lab, e.g.
// "B77215_2026-09-17_Bellerophon.pdf". Shared by the server (storage path, download name) and
// the screens that show it. Pure functions.

/** Keeps letters, digits, "-" and "."; everything else becomes "-". Never empty. */
export function namePart(value: string | null | undefined, fallback: string): string {
  const clean = (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return clean || fallback;
}

export type NameParts = {
  reportNo: string | null | undefined;
  /** YYYY-MM-DD */
  reportDate: string | Date | null | undefined;
  lab: string | null | undefined;
};

function isoDate(d: NameParts["reportDate"]): string | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}

/** "B77215_2026-09-17_Bellerophon", without extension. `n` > 1 adds "_2", "_3"… */
export function standardBaseName(parts: NameParts, n = 1): string {
  const base = [
    namePart(parts.reportNo, "NoReportNo"),
    isoDate(parts.reportDate) ?? "NoDate",
    namePart(parts.lab, "NoLab"),
  ].join("_");
  return n > 1 ? `${base}_${n}` : base;
}

export function standardFileName(parts: NameParts, ext: string, n = 1): string {
  return `${standardBaseName(parts, n)}.${ext}`;
}

/** The file name part of a storage path ("<certificate id>/<name>"). */
export function baseNameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/** True when a name has a part that could not be filled in yet. */
export function nameIsIncomplete(parts: NameParts): boolean {
  return !namePart(parts.reportNo, "") || !isoDate(parts.reportDate) || !namePart(parts.lab, "");
}
