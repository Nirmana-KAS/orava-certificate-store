import "server-only";

import { db } from "./db";

export type Lab = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  website: string;
  /** Changes when the logo changes, so browsers fetch the new one; null without a logo */
  logoVersion: number | null;
  archived: boolean;
  typeCount: number;
};

type Row = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  website: string;
  logo_version: string | null;
  archived: boolean;
  type_count: number;
};

const toLab = (r: Row): Lab => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  shortName: r.short_name,
  website: r.website,
  logoVersion: r.logo_version === null ? null : Number(r.logo_version),
  archived: r.archived,
  typeCount: r.type_count,
});

export async function listLabs(opts: { includeArchived?: boolean } = {}): Promise<Lab[]> {
  const rows = await db()<Row[]>`
    select l.id, l.slug, l.name, l.short_name, l.website, l.archived,
      case when l.logo is null then null
           else floor(extract(epoch from l.logo_updated_at))::bigint::text end as logo_version,
      (select count(*)::int from certificate_types t where t.lab_id = l.id) as type_count
    from labs l
    where ${opts.includeArchived ? db()`true` : db()`l.archived = false`}
    order by l.archived, l.sort_order, l.name
  `;
  return rows.map(toLab);
}

export async function getLab(id: string): Promise<Lab | null> {
  const [row] = await db()<Row[]>`
    select l.id, l.slug, l.name, l.short_name, l.website, l.archived,
      case when l.logo is null then null
           else floor(extract(epoch from l.logo_updated_at))::bigint::text end as logo_version,
      (select count(*)::int from certificate_types t where t.lab_id = l.id) as type_count
    from labs l where l.id = ${id}
  `;
  return row ? toLab(row) : null;
}

/** The logo's address; the version in it lets browsers keep it cached until it changes. */
export function logoUrl(labId: string, version: number | null): string | null {
  return version === null ? null : `/api/labs/${labId}/logo?v=${version}`;
}
