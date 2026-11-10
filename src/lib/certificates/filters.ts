import { z } from "zod";

import { CATEGORIES } from "@/lib/labs";

// The search and filters of a certificate list, read from the page address so a filtered list
// can be bookmarked, shared or opened again. Shared by the server (query) and the pages (form).

export const SORTS = {
  added_desc: "Newest added",
  date_desc: "Report date, newest",
  date_asc: "Report date, oldest",
  report_asc: "Report number, A to Z",
  report_desc: "Report number, Z to A",
  carat_desc: "Carats, highest",
  carat_asc: "Carats, lowest",
  lab_asc: "Lab, A to Z",
  gem_asc: "Stone, A to Z",
} as const;
export type SortKey = keyof typeof SORTS;
const SORT_KEYS = Object.keys(SORTS) as [SortKey, ...SortKey[]];

export const PAGE_SIZE = 25;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined)
    .catch(undefined);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const carat = z.coerce.number().min(0).max(100_000).optional().catch(undefined);
const id = z.uuid().optional().catch(undefined);

export const filtersSchema = z.object({
  q: text(100),
  lab: id,
  type: id,
  category: z.enum(CATEGORIES).optional().catch(undefined),
  gem: text(200),
  origin: text(200),
  from: date,
  to: date,
  min: carat,
  max: carat,
  sort: z.enum(SORT_KEYS).default("added_desc").catch("added_desc"),
  then: z.enum(SORT_KEYS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type Filters = z.infer<typeof filtersSchema>;

type Params = Record<string, string | string[] | undefined>;

export function parseFilters(params: Params): Filters {
  const one: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v;
    // An empty box means "not used", not zero
    one[k] = value === "" ? undefined : value;
  }
  return filtersSchema.parse(one);
}

/** How many filters (beyond the search words) are in use: shown on the "More filters" button. */
export function activeFilterCount(f: Filters): number {
  return [f.lab, f.type, f.category, f.gem, f.origin, f.from, f.to, f.min, f.max].filter(
    (v) => v !== undefined,
  ).length;
}

/** The address of this list with some values changed (used for pages and "remove filter"). */
export function filtersHref(base: string, f: Filters, change: Partial<Filters> = {}): string {
  const next: Record<string, unknown> = { ...f, ...change };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "sort" && v === "added_desc") continue;
    if (k === "page" && v === 1) continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}
