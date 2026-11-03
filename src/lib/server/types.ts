import "server-only";

import { fieldSchema, type FieldDef } from "@/lib/types/schema";

import { db } from "./db";

export type CertType = {
  id: string;
  slug: string;
  name: string;
  lab: string;
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
    select t.id, t.slug, t.name, t.lab, t.description, t.icon, t.color, t.expiry_tracking,
      t.expiry_warning_days, t.fields, t.fingerprints, t.summary_template, t.version, t.archived,
      (select count(*)::int from certificates c where c.type_id = t.id and c.deleted_at is null) as certificate_count
    from certificate_types t
    where ${opts.includeArchived ? db()`true` : db()`t.archived = false`}
    order by t.archived, t.sort_order, t.name
  `;
  return rows.map(toType);
}

export async function getType(id: string): Promise<CertType | null> {
  const [row] = await db()<Row[]>`
    select t.id, t.slug, t.name, t.lab, t.description, t.icon, t.color, t.expiry_tracking,
      t.expiry_warning_days, t.fields, t.fingerprints, t.summary_template, t.version, t.archived,
      (select count(*)::int from certificates c where c.type_id = t.id and c.deleted_at is null) as certificate_count
    from certificate_types t where t.id = ${id}
  `;
  return row ? toType(row) : null;
}
