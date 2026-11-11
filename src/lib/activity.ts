// The activity log (audit_logs) filters. Used by the page, the CSV download and the tests.

/** Kinds of activity, by the start of the action name. */
export const KINDS = {
  sign_in: { label: "Sign-ins", prefixes: ["sign_in", "sign_out", "admin."] },
  certificates: { label: "Certificates", prefixes: ["certificate."] },
  files: { label: "File views and downloads", prefixes: ["file."] },
  reports: { label: "Reports", prefixes: ["report."] },
  uploads: { label: "Upload mode", prefixes: ["upload."] },
  staff: { label: "Staff and permissions", prefixes: ["user."] },
  types: { label: "Types and labs", prefixes: ["type.", "lab."] },
  trash: { label: "Trash", prefixes: ["trash."] },
  backup: { label: "Backups and exports", prefixes: ["backup.", "activity."] },
  settings: { label: "Settings", prefixes: ["settings."] },
} as const;

export type Kind = keyof typeof KINDS;

export type ActivityFilters = {
  q?: string;
  who?: string;
  kind?: Kind;
  from?: string;
  to?: string;
  page: number;
};

export const ACTIVITY_PAGE_SIZE = 50;
export const ACTIVITY_EXPORT_LIMIT = 10_000;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();
const isDate = (v: string | undefined) =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function parseActivityFilters(params: Params): ActivityFilters {
  const q = one(params.q)?.slice(0, 100) || undefined;
  const who = one(params.who)?.toLowerCase().slice(0, 254) || undefined;
  const kindRaw = one(params.kind);
  const kind = kindRaw && kindRaw in KINDS ? (kindRaw as Kind) : undefined;
  let from = isDate(one(params.from)) ? one(params.from) : undefined;
  let to = isDate(one(params.to)) ? one(params.to) : undefined;
  if (from && to && from > to) [from, to] = [to, from];
  const pageNum = Number(one(params.page));
  const page = Number.isInteger(pageNum) && pageNum > 0 && pageNum <= 10_000 ? pageNum : 1;
  return { q, who, kind, from, to, page };
}

/** The address for these filters (page 1 is left out). */
export function activityHref(
  base: string,
  f: ActivityFilters,
  change: Partial<ActivityFilters> = {},
) {
  const next = { ...f, ...change };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.who) p.set("who", next.who);
  if (next.kind) p.set("kind", next.kind);
  if (next.from) p.set("from", next.from);
  if (next.to) p.set("to", next.to);
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** LIKE patterns for a kind, e.g. "certificate.%". */
export function kindPatterns(kind: Kind): string[] {
  return KINDS[kind].prefixes.map((p) => `${p.replace(/[\\%_]/g, "\\$&")}%`);
}

/** A LIKE pattern that finds the words anywhere, with % and _ taken literally. */
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}
