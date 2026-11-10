import { z } from "zod";

import { CATEGORY_LABELS } from "@/lib/labs";

// What a report shows: its title, columns and grouping. Read from the page address together with
// the search filters, so the same address gives the same report on screen and in every export.

export const COLUMNS = {
  report_no: "Report number",
  report_date: "Date",
  lab: "Lab",
  type: "Type",
  category: "Kind of report",
  stone: "Stone",
  weight: "Carats",
  origin: "Origin",
  customer: "Customer",
  files: "Files",
  summary: "Summary",
} as const;
export type ColumnKey = keyof typeof COLUMNS;
const COLUMN_KEYS = Object.keys(COLUMNS) as ColumnKey[];
export const DEFAULT_COLUMNS: ColumnKey[] = [
  "report_no",
  "report_date",
  "lab",
  "stone",
  "weight",
  "origin",
];

export const GROUPS = {
  none: "No grouping",
  lab: "Lab",
  type: "Type",
  category: "Kind of report",
  stone: "Stone",
  origin: "Origin",
  month: "Month",
} as const;
export type GroupKey = keyof typeof GROUPS;

export const FORMATS = ["pdf", "xlsx", "csv"] as const;
export type Format = (typeof FORMATS)[number];

/** Most rows shown on screen; exports include up to EXPORT_LIMIT. */
export const PREVIEW_LIMIT = 300;
export const EXPORT_LIMIT = 5000;

export type ReportOptions = { title: string; columns: ColumnKey[]; group: GroupKey };

type Params = Record<string, string | string[] | undefined>;

export function parseReportOptions(params: Params): ReportOptions {
  const raw = params.cols;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  const picked = COLUMN_KEYS.filter((k) => list.includes(k));
  const title = z
    .string()
    .trim()
    .max(120)
    .catch("")
    .parse(Array.isArray(params.title) ? params.title[0] : (params.title ?? ""));
  const group = z
    .enum(Object.keys(GROUPS) as [GroupKey, ...GroupKey[]])
    .catch("none")
    .parse(Array.isArray(params.group) ? params.group[0] : params.group);
  return {
    title: title || "Certificate report",
    columns: picked.length ? picked : DEFAULT_COLUMNS,
    group,
  };
}

/** Query string for this report (filters + options), used by the export links. */
export function reportQuery(filterHref: string, o: ReportOptions): string {
  const sp = new URLSearchParams(filterHref.split("?")[1] ?? "");
  sp.delete("page");
  sp.set("cols", o.columns.join(","));
  if (o.group !== "none") sp.set("group", o.group);
  if (o.title !== "Certificate report") sp.set("title", o.title);
  return sp.toString();
}

export type ReportRow = {
  id: string;
  report_no: string | null;
  report_date: string | null; // YYYY-MM-DD
  lab: string | null;
  type: string;
  category: string | null;
  stone: string | null;
  weight: number | null;
  origin: string | null;
  customer: string | null;
  files: number;
  summary: string;
};

export type ReportGroup = { label: string; rows: ReportRow[]; count: number; carats: number };
export type Report = {
  options: ReportOptions;
  groups: ReportGroup[];
  count: number;
  carats: number;
  /** More rows matched than the limit allowed */
  cut: boolean;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function groupLabel(r: ReportRow, g: GroupKey): string {
  switch (g) {
    case "lab":
      return r.lab || "No lab";
    case "type":
      return r.type;
    case "category":
      return r.category
        ? (CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category)
        : "Not set";
    case "stone":
      return r.stone || "Not set";
    case "origin":
      return r.origin || "Not set";
    case "month":
      return r.report_date
        ? `${MONTHS[Number(r.report_date.slice(5, 7)) - 1]} ${r.report_date.slice(0, 4)}`
        : "No date";
    default:
      return "All certificates";
  }
}

const sumCarats = (rows: ReportRow[]) =>
  Math.round(rows.reduce((s, r) => s + (r.weight ?? 0), 0) * 1000) / 1000;

/** Splits the rows into groups (keeping their order inside each group) with counts and carats. */
export function buildReport(rows: ReportRow[], options: ReportOptions, cut: boolean): Report {
  const map = new Map<string, { label: string; rows: ReportRow[]; sortKey: string }>();
  for (const r of rows) {
    const label = groupLabel(r, options.group);
    const sortKey =
      options.group === "month" ? (r.report_date?.slice(0, 7) ?? "0000") : label.toLowerCase();
    const g = map.get(label) ?? { label, rows: [], sortKey };
    g.rows.push(r);
    map.set(label, g);
  }
  const list = [...map.values()].sort((a, b) =>
    options.group === "month"
      ? b.sortKey.localeCompare(a.sortKey)
      : a.sortKey.localeCompare(b.sortKey),
  );
  return {
    options,
    groups: list.map((g) => ({
      label: g.label,
      rows: g.rows,
      count: g.rows.length,
      carats: sumCarats(g.rows),
    })),
    count: rows.length,
    carats: sumCarats(rows),
    cut,
  };
}

/** One cell as text, the same on screen and in every export. */
export function cellText(r: ReportRow, c: ColumnKey): string {
  switch (c) {
    case "report_date":
      return r.report_date
        ? `${r.report_date.slice(8, 10)} ${MONTHS[Number(r.report_date.slice(5, 7)) - 1]!.slice(0, 3)} ${r.report_date.slice(0, 4)}`
        : "";
    case "weight":
      return r.weight === null ? "" : String(r.weight);
    case "category":
      return r.category
        ? (CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category)
        : "";
    case "files":
      return String(r.files);
    case "stone":
      return r.stone ?? "";
    default:
      return (r[c] as string | null) ?? "";
  }
}

export const caratsText = (n: number) => `${Math.round(n * 1000) / 1000} ct`;
