import "server-only";

import type { Category } from "@/lib/labs";
import { fieldSchema, type FieldDef } from "@/lib/types/schema";

import { db } from "./db";

export type CertType = {
  id: string;
  slug: string;
  name: string;
  /** The lab's short name ("" when no lab is set) */
  lab: string;
  labId: string | null;
  labName: string | null;
  /** Logo address of the lab, or null */
  labLogo: string | null;
  category: Category | null;
  description: string;
  icon: string;
  color: string;
  expiryTracking: boolean;
  expiryWarningDays: number;
  fields: FieldDef[];
  fingerprints: string[];
  summaryTemplate: string;
  version: number;
  archived: boolean;
  certificateCount: number;
};

type Row = {
  id: string;
  slug: string;
  name: string;
  lab: string;
  lab_id: string | null;
  lab_name: string | null;
  lab_logo_version: string | null;
  category: Category | null;
  description: string;
  icon: string;
  color: string;
  expiry_tracking: boolean;
  expiry_warning_days: number;
  fields: unknown;
  fingerprints: string[];
  summary_template: string;
  version: number;
  archived: boolean;
  certificate_count: number;
};

/** Reads stored field definitions; a field that no longer passes the rules is skipped, not fatal. */
function parseFields(value: unknown): FieldDef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((f) => {
    const parsed = fieldSchema.safeParse(f);
    return parsed.success ? [parsed.data] : [];
  });
}

function toType(r: Row): CertType {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    lab: r.lab,
    labId: r.lab_id,
    labName: r.lab_name,
    labLogo:
      r.lab_id && r.lab_logo_version ? `/api/labs/${r.lab_id}/logo?v=${r.lab_logo_version}` : null,
    category: r.category,
    description: r.description,
    icon: r.icon,
    color: r.color,
    expiryTracking: r.expiry_tracking,
    expiryWarningDays: r.expiry_warning_days,
    fields: parseFields(r.fields),
    fingerprints: r.fingerprints,
    summaryTemplate: r.summary_template,
    version: r.version,
    archived: r.archived,
    certificateCount: r.certificate_count,
  };
}

export async function listTypes(opts: { includeArchived?: boolean } = {}): Promise<CertType[]> {
  const rows = await db()<Row[]>`
    select t.id, t.slug, t.name, coalesce(l.short_name, t.lab) as lab, t.lab_id,
      l.name as lab_name, t.category,
      case when l.logo is null then null
           else floor(extract(epoch from l.logo_updated_at))::bigint::text end as lab_logo_version,
      t.description, t.icon, t.color, t.expiry_tracking,
      t.expiry_warning_days, t.fields, t.fingerprints, t.summary_template, t.version, t.archived,
      (select count(*)::int from certificates c where c.type_id = t.id and c.deleted_at is null) as certificate_count
    from certificate_types t left join labs l on l.id = t.lab_id
    where ${opts.includeArchived ? db()`true` : db()`t.archived = false`}
    order by t.archived, t.sort_order, t.name
  `;
  return rows.map(toType);
}

export async function getType(id: string): Promise<CertType | null> {
  const [row] = await db()<Row[]>`
    select t.id, t.slug, t.name, coalesce(l.short_name, t.lab) as lab, t.lab_id,
      l.name as lab_name, t.category,
      case when l.logo is null then null
           else floor(extract(epoch from l.logo_updated_at))::bigint::text end as lab_logo_version,
      t.description, t.icon, t.color, t.expiry_tracking,
      t.expiry_warning_days, t.fields, t.fingerprints, t.summary_template, t.version, t.archived,
      (select count(*)::int from certificates c where c.type_id = t.id and c.deleted_at is null) as certificate_count
    from certificate_types t left join labs l on l.id = t.lab_id where t.id = ${id}
  `;
  return row ? toType(row) : null;
}
