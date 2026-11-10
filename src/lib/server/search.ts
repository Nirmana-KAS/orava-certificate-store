import "server-only";

import { PAGE_SIZE, type Filters, type SortKey } from "@/lib/certificates/filters";

import { db } from "./db";

export type SearchRow = {
  id: string;
  title: string;
  report_no: string | null;
  report_date: string | null;
  report_date_iso: string | null;
  weight_ct: string | null;
  identification: string | null;
  customer: string | null;
  origin: string | null;
  summary: string;
  type_name: string;
  type_icon: string;
  type_color: string;
  category: string | null;
  lab_id: string | null;
  lab: string | null;
  lab_logo_version: string | null;
  files: number;
  first_file: string | null;
  needs_review: boolean;
};

// Only these fixed fragments ever reach ORDER BY; the user picks a key, never the SQL.
function orderBy(sql: ReturnType<typeof db>, key: SortKey) {
  switch (key) {
    case "added_desc":
      return sql`c.created_at desc`;
    case "date_desc":
      return sql`c.report_date desc nulls last`;
    case "date_asc":
      return sql`c.report_date asc nulls last`;
    case "report_asc":
      return sql`lower(c.report_no) asc nulls last`;
    case "report_desc":
      return sql`lower(c.report_no) desc nulls last`;
    case "carat_desc":
      return sql`c.weight_ct desc nulls last`;
    case "carat_asc":
      return sql`c.weight_ct asc nulls last`;
    case "lab_asc":
      return sql`lower(coalesce(l.short_name, t.lab)) asc nulls last`;
    case "gem_asc":
      return sql`lower(c.identification) asc nulls last`;
  }
}

/** "50%" typed in the box means the text 50%, not a wildcard. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * Live certificates matching the filters, one page at a time, with the total count. With
 * `limit`, the first `limit` matches (for reports) instead of a page.
 */
export async function searchCertificates(
  f: Filters,
  opts: { limit?: number } = {},
): Promise<{ rows: SearchRow[]; total: number }> {
  const sql = db();
  const words = (f.q ?? "").split(/\s+/).filter(Boolean).slice(0, 8);

  // Every word must appear somewhere: in the main fields, the type values or the text read
  // from the file
  const wordConditions = words.reduce(
    (acc, w) => {
      const like = `%${likeEscape(w)}%`;
      return sql`${acc} and (
      c.title ilike ${like} or c.report_no ilike ${like} or c.customer ilike ${like}
      or c.identification ilike ${like} or c.summary ilike ${like}
      or c.data::text ilike ${like} or c.ocr_text ilike ${like}
      or t.name ilike ${like} or coalesce(l.short_name, t.lab) ilike ${like}
    )`;
    },
    sql``,
  );

  const second = f.then && f.then !== f.sort ? sql`, ${orderBy(sql, f.then)}` : sql``;
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = opts.limit ? 0 : (f.page - 1) * PAGE_SIZE;

  const rows = await sql<(SearchRow & { total: number })[]>`
    select c.id, c.title, c.report_no, to_char(c.report_date, 'DD Mon YYYY') as report_date,
      to_char(c.report_date, 'YYYY-MM-DD') as report_date_iso,
      c.weight_ct::text as weight_ct, c.identification, c.customer,
      nullif(c.data->>'origin', '') as origin, c.summary,
      t.name as type_name, t.icon as type_icon, t.color as type_color, t.category,
      c.needs_review, l.id as lab_id, coalesce(l.short_name, nullif(t.lab, '')) as lab,
      case when l.logo is null then null
           else floor(extract(epoch from l.logo_updated_at))::bigint::text end as lab_logo_version,
      (select count(*)::int from certificate_files f
        where f.certificate_id = c.id and f.status = 'ready') as files,
      (select f.id from certificate_files f
        where f.certificate_id = c.id and f.status = 'ready'
        order by f.created_at, f.id limit 1) as first_file,
      count(*) over ()::int as total
    from certificates c
    join certificate_types t on t.id = c.type_id
    left join labs l on l.id = t.lab_id
    where c.deleted_at is null
      ${f.lab ? sql`and t.lab_id = ${f.lab}` : sql``}
      ${f.type ? sql`and c.type_id = ${f.type}` : sql``}
      ${f.category ? sql`and t.category = ${f.category}` : sql``}
      ${f.gem ? sql`and lower(c.identification) = lower(${f.gem})` : sql``}
      ${f.origin ? sql`and lower(c.data->>'origin') = lower(${f.origin})` : sql``}
      ${f.from ? sql`and c.report_date >= ${f.from}::date` : sql``}
      ${f.to ? sql`and c.report_date <= ${f.to}::date` : sql``}
      ${f.min !== undefined ? sql`and c.weight_ct >= ${f.min}` : sql``}
      ${f.max !== undefined ? sql`and c.weight_ct <= ${f.max}` : sql``}
      ${wordConditions}
    order by ${orderBy(sql, f.sort)}${second}, c.id
    limit ${limit} offset ${offset}
  `;
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && offset > 0) {
    // Past the last page: count without paging so the page can say how many there are
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from certificates where deleted_at is null
    `;
    total = row?.n ?? 0;
  }
  // Each row also carries the total; it does no harm in the page
  return { rows, total };
}

export type FilterOptions = {
  labs: { id: string; name: string }[];
  types: { id: string; name: string }[];
  gems: string[];
  origins: string[];
};

/** The choices for the filter lists: only values that some certificate actually has. */
export async function filterOptions(): Promise<FilterOptions> {
  const sql = db();
  const [labs, types, gems, origins] = await Promise.all([
    sql<{ id: string; name: string }[]>`
      select id, short_name as name from labs where not archived order by sort_order, short_name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from certificate_types where not archived order by sort_order, name
    `,
    sql<{ v: string }[]>`
      select min(identification) as v from certificates
      where deleted_at is null and coalesce(identification, '') <> ''
      group by lower(identification) order by 1 limit 300
    `,
    sql<{ v: string }[]>`
      select min(data->>'origin') as v from certificates
      where deleted_at is null and coalesce(data->>'origin', '') <> ''
      group by lower(data->>'origin') order by 1 limit 300
    `,
  ]);
  return { labs, types, gems: gems.map((r) => r.v), origins: origins.map((r) => r.v) };
}
