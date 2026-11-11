import "server-only";

import type postgres from "postgres";

import { db } from "./db";
import { signedDownloadUrls } from "./storage";

// Backups are put together in the admin's browser, a page at a time, so no single answer from
// the server is large (Vercel answers are limited to about 4.5 MB). The files themselves come
// straight from storage through short-lived links, never through the server.

type Table = {
  /** Rows per page; smaller where rows are big (certificates keep the text read from files) */
  page: number;
  /** Columns left out of the backup: secrets that must never sit in a file on a PC */
  omit?: string[];
  /** Key for paging; "id" unless the table has a two-part key */
  key?: "id" | "type_version";
};

export const BACKUP_TABLES: Record<string, Table> = {
  schema_migrations: { page: 500, key: undefined },
  app_settings: { page: 1, omit: ["passkey_hash"] },
  app_users: {
    page: 500,
    omit: ["upload_passkey_hash", "upload_failures", "upload_locked_at"],
  },
  labs: { page: 20 },
  certificate_types: { page: 100 },
  certificate_type_versions: { page: 200, key: "type_version" },
  certificates: { page: 100 },
  certificate_files: { page: 500 },
  audit_logs: { page: 1000 },
  security_events: { page: 1000 },
};

export type BackupTable = keyof typeof BACKUP_TABLES;
export const isBackupTable = (t: string): t is BackupTable => t in BACKUP_TABLES;

/** Byte columns (lab logos) become base64 text, so the backup is plain JSON. */
function plain(row: Record<string, unknown>, omit: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (omit.includes(k)) continue;
    out[k] = v instanceof Uint8Array ? { base64: Buffer.from(v).toString("base64") } : v;
  }
  return out;
}

/** One page of a table, oldest key first, and the cursor for the next page (or null). */
export async function backupPage(
  table: BackupTable,
  after: string | null,
): Promise<{ rows: Record<string, unknown>[]; next: string | null }> {
  const t = BACKUP_TABLES[table]!;
  const sql = db();
  let rows: postgres.Row[];
  if (table === "schema_migrations") {
    rows = await sql`select * from schema_migrations order by name`;
    return { rows: rows.map((r) => plain(r)), next: null };
  }
  if (table === "app_settings") {
    rows = await sql`select * from app_settings`;
    return { rows: rows.map((r) => plain(r, t.omit)), next: null };
  }
  if (t.key === "type_version") {
    const [typeId, version] = (after ?? "").split(":");
    rows = await sql`
      select * from certificate_type_versions
      ${after ? sql`where (type_id, version) > (${typeId!}::uuid, ${Number(version)}::int)` : sql``}
      order by type_id, version limit ${t.page}
    `;
    const last = rows.at(-1);
    return {
      rows: rows.map((r) => plain(r, t.omit)),
      next: rows.length === t.page && last ? `${last.type_id}:${last.version}` : null,
    };
  }
  // Every other table has a single id: uuid or a number that only grows
  const numeric = table === "audit_logs" || table === "security_events";
  rows = await sql`
    select * from ${sql(table)}
    ${after ? (numeric ? sql`where id > ${after}::bigint` : sql`where id > ${after}::uuid`) : sql``}
    order by id limit ${t.page}
  `;
  const last = rows.at(-1);
  return {
    rows: rows.map((r) => plain(r, t.omit)),
    next: rows.length === t.page && last ? String(last.id) : null,
  };
}

export type BackupFile = { id: string; path: string; size: number; url: string | null };

const FILES_PAGE = 50;

/** One page of stored files with a 15-minute link to each. */
export async function backupFiles(
  after: string | null,
): Promise<{ files: BackupFile[]; next: string | null }> {
  const rows = await db()<{ id: string; storage_path: string; size_bytes: string }[]>`
    select id, storage_path, size_bytes::text from certificate_files
    where status = 'ready' ${after ? db()`and id > ${after}::uuid` : db()``}
    order by id limit ${FILES_PAGE}
  `;
  const links = await signedDownloadUrls(
    rows.map((r) => r.storage_path),
    15 * 60,
  );
  return {
    files: rows.map((r) => ({
      id: r.id,
      path: r.storage_path,
      size: Number(r.size_bytes),
      url: links.get(r.storage_path) ?? null,
    })),
    next: rows.length === FILES_PAGE ? rows.at(-1)!.id : null,
  };
}

export type BackupSummary = {
  certificates: number;
  trash: number;
  files: number;
  fileBytes: number;
  activity: number;
  lastBackup: { at: Date; by: string | null } | null;
};

export async function backupSummary(): Promise<BackupSummary> {
  const [[counts], [last]] = await Promise.all([
    db()<{ certificates: number; trash: number; files: number; bytes: string; activity: number }[]>`
      select
        (select count(*)::int from certificates where deleted_at is null) as certificates,
        (select count(*)::int from certificates where deleted_at is not null) as trash,
        (select count(*)::int from certificate_files where status = 'ready') as files,
        (select coalesce(sum(size_bytes), 0)::text from certificate_files where status = 'ready') as bytes,
        (select count(*)::int from audit_logs) as activity
    `,
    db()<{ at: Date; by: string | null }[]>`
      select at, actor_email as by from audit_logs
      where action = 'backup.complete' order by at desc limit 1
    `,
  ]);
  return {
    certificates: counts?.certificates ?? 0,
    trash: counts?.trash ?? 0,
    files: counts?.files ?? 0,
    fileBytes: Number(counts?.bytes ?? 0),
    activity: counts?.activity ?? 0,
    lastBackup: last ?? null,
  };
}

/** A backup is due when there is something to keep and none was made in the last 7 days. */
export const BACKUP_EVERY_DAYS = 7;

export function backupDue(s: BackupSummary, now = new Date()): boolean {
  if (s.certificates + s.trash === 0) return false;
  if (!s.lastBackup) return true;
  return now.getTime() - new Date(s.lastBackup.at).getTime() > BACKUP_EVERY_DAYS * 86_400_000;
}
