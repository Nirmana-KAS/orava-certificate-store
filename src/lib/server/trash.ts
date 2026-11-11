import "server-only";

import { db } from "./db";
import { removeObjects, storageConfigured } from "./storage";

/** Deleted certificates, and earlier versions kept after a Replace, are erased after this. */
export const TRASH_DAYS = 30;

export type TrashItem = {
  id: string;
  title: string;
  report_no: string | null;
  type_name: string;
  deleted_at: Date;
  deleted_by: string | null;
  files: number;
  /** The first file, for "View file" */
  file_id: string | null;
  versions: number;
  /** Another live certificate now has the same report number, so Restore would clash */
  clash: string | null;
};

/** What is in the Trash: deleted certificates (not the earlier versions kept by Replace). */
export async function trashItems(): Promise<TrashItem[]> {
  return db()<TrashItem[]>`
    select c.id, c.title, c.report_no, t.name as type_name, c.deleted_at,
      coalesce(u.name, u.email) as deleted_by,
      (select count(*)::int from certificate_files f
        where f.certificate_id = c.id and f.status = 'ready') as files,
      (select f.id from certificate_files f where f.certificate_id = c.id and f.status = 'ready'
        order by f.created_at, f.id limit 1) as file_id,
      (select count(*)::int from certificates v where v.replaced_by = c.id) as versions,
      (select l.title from certificates l
        where l.deleted_at is null and l.type_id = c.type_id
          and coalesce(c.report_no, '') <> '' and lower(l.report_no) = lower(c.report_no)
        limit 1) as clash
    from certificates c
    join certificate_types t on t.id = c.type_id
    left join app_users u on u.id = c.deleted_by
    where c.deleted_at is not null and c.replaced_by is null
    order by c.deleted_at desc
  `;
}

export async function trashCount(): Promise<number> {
  const [row] = await db()<{ n: number }[]>`
    select count(*)::int as n from certificates where deleted_at is not null and replaced_by is null
  `;
  return row?.n ?? 0;
}

/** The date a deleted certificate (or a kept earlier version) will be erased. */
export function eraseDate(deletedAt: Date): Date {
  return new Date(new Date(deletedAt).getTime() + TRASH_DAYS * 86_400_000);
}

/** Whole days left before it is erased (0 means today). */
export function daysLeft(deletedAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((eraseDate(deletedAt).getTime() - now.getTime()) / 86_400_000));
}

/**
 * Erases deleted certificates for good: their files in storage first, then their earlier
 * versions, files records and the certificates themselves. Only rows that are already deleted
 * can be erased. Returns the titles that were erased.
 */
export async function eraseCertificates(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const sql = db();
  // The certificates and the earlier versions they keep (Replace keeps one level: every
  // version points at the live certificate it was replaced by)
  const rows = await sql<{ id: string; title: string; replaced_by: string | null }[]>`
    select id, title, replaced_by from certificates
    where deleted_at is not null and (id = any(${ids}::uuid[]) or replaced_by = any(${ids}::uuid[]))
  `;
  if (rows.length === 0) return [];
  const all = rows.map((r) => r.id);
  const files = await sql<{ storage_path: string }[]>`
    select storage_path from certificate_files where certificate_id = any(${all}::uuid[])
  `;
  // Storage first: if it fails, nothing is erased and the next try starts again
  if (files.length > 0) {
    if (!storageConfigured()) throw new Error("File storage is not set up.");
    for (let i = 0; i < files.length; i += 100) {
      await removeObjects(files.slice(i, i + 100).map((f) => f.storage_path));
    }
  }
  await sql.begin(async (tx) => {
    await tx`delete from certificate_files where certificate_id = any(${all}::uuid[])`;
    // Versions first: they point at the certificate that replaced them
    await tx`
      delete from certificates
      where id = any(${all}::uuid[]) and replaced_by is not null and deleted_at is not null
    `;
    await tx`delete from certificates where id = any(${all}::uuid[]) and deleted_at is not null`;
  });
  return rows.filter((r) => ids.includes(r.id)).map((r) => r.title);
}

/**
 * Erases everything deleted more than 30 days ago: certificates in the Trash and earlier
 * versions kept after a Replace. Runs when the admin opens the Trash and once a day.
 */
export async function eraseExpired(
  limit = 200,
): Promise<{ certificates: number; versions: number }> {
  const rows = await db()<{ id: string; replaced_by: string | null }[]>`
    select id, replaced_by from certificates
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => ${TRASH_DAYS})
    order by deleted_at
    limit ${limit}
  `;
  if (rows.length === 0) return { certificates: 0, versions: 0 };
  await eraseCertificates(rows.map((r) => r.id));
  return {
    certificates: rows.filter((r) => !r.replaced_by).length,
    versions: rows.filter((r) => r.replaced_by).length,
  };
}
