import "server-only";

import { baseNameOf, standardFileName, type NameParts } from "@/lib/files/naming";
import { ALLOWED_TYPES } from "@/lib/files/rules";

import { db } from "./db";
import { moveObject } from "./storage";

// Every stored file is kept as "<certificate id>/<ReportNo>_<Date>_<Lab>.<ext>". The folder keeps
// paths unique (a replaced certificate's file can have the same name); the name is what people see
// and what a download is saved as.

type FileRow = { id: string; storage_path: string; mime: string; created_at: Date };

export async function namePartsFor(certId: string): Promise<NameParts | null> {
  const [row] = await db()<
    { report_no: string | null; report_date: string | null; lab: string | null }[]
  >`
    select c.report_no, to_char(c.report_date, 'YYYY-MM-DD') as report_date,
      coalesce(l.short_name, nullif(t.lab, '')) as lab
    from certificates c
    join certificate_types t on t.id = c.type_id
    left join labs l on l.id = t.lab_id
    where c.id = ${certId}
  `;
  return row ? { reportNo: row.report_no, reportDate: row.report_date, lab: row.lab } : null;
}

const extOf = (mime: string) => ALLOWED_TYPES[mime as keyof typeof ALLOWED_TYPES]?.ext ?? "bin";

/** The names each file of a certificate should have, oldest file first (_2, _3 after it). */
function wanted(certId: string, parts: NameParts, files: FileRow[]): Map<string, string> {
  const out = new Map<string, string>();
  files.forEach((f, i) => {
    out.set(f.id, `${certId}/${standardFileName(parts, extOf(f.mime), i + 1)}`);
  });
  return out;
}

/** The storage path for a new file of this certificate, after the ones it already has. */
export async function pathForNewFile(certId: string, mime: string): Promise<string> {
  const parts = (await namePartsFor(certId)) ?? { reportNo: null, reportDate: null, lab: null };
  const taken = new Set(
    (
      await db()<{ storage_path: string }[]>`
        select storage_path from certificate_files where certificate_id = ${certId}
      `
    ).map((r) => r.storage_path),
  );
  for (let n = 1; ; n++) {
    const path = `${certId}/${standardFileName(parts, extOf(mime), n)}`;
    if (!taken.has(path)) return path;
  }
}

/**
 * Gives a certificate's files their standard names again, after its report number, date or lab
 * changed. Returns how many files were renamed. A file that can't be moved keeps its old name
 * (it still works) and is tried again next time.
 */
export async function syncFileNames(certId: string): Promise<number> {
  const parts = await namePartsFor(certId);
  if (!parts) return 0;
  const files = await db()<FileRow[]>`
    select id, storage_path, mime, created_at from certificate_files
    where certificate_id = ${certId} and status = 'ready' order by created_at, id
  `;
  const target = wanted(certId, parts, files);
  const todo = files.filter((f) => target.get(f.id) !== f.storage_path);
  if (todo.length === 0) return 0;

  // Two steps, so two files swapping names never collide: first to a temporary name, then home
  const moved: { file: FileRow; temp: string }[] = [];
  for (const file of todo) {
    const temp = `${certId}/tmp-${file.id}.${extOf(file.mime)}`;
    try {
      await moveObject(file.storage_path, temp);
      await db()`update certificate_files set storage_path = ${temp} where id = ${file.id}`;
      moved.push({ file, temp });
    } catch (error) {
      console.error("rename (step 1) failed", baseNameOf(file.storage_path), error);
    }
  }
  let done = 0;
  for (const { file, temp } of moved) {
    const to = target.get(file.id)!;
    try {
      await moveObject(temp, to);
      await db()`update certificate_files set storage_path = ${to} where id = ${file.id}`;
      done++;
    } catch (error) {
      console.error("rename (step 2) failed", baseNameOf(to), error);
    }
  }
  return done;
}

/** Certificates (live or kept as history) that have at least one file without its standard name. */
export async function certificatesWithOldNames(limit = 1000): Promise<string[]> {
  const rows = await db()<
    {
      certificate_id: string;
      id: string;
      storage_path: string;
      mime: string;
      created_at: Date;
      report_no: string | null;
      report_date: string | null;
      lab: string | null;
    }[]
  >`
    select f.certificate_id, f.id, f.storage_path, f.mime, f.created_at, c.report_no,
      to_char(c.report_date, 'YYYY-MM-DD') as report_date,
      coalesce(l.short_name, nullif(t.lab, '')) as lab
    from certificate_files f
    join certificates c on c.id = f.certificate_id
    join certificate_types t on t.id = c.type_id
    left join labs l on l.id = t.lab_id
    where f.status = 'ready'
    order by f.certificate_id, f.created_at, f.id
  `;
  const byCert = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    const list = byCert.get(r.certificate_id);
    if (list) list.push(r);
    else byCert.set(r.certificate_id, [r]);
  }
  const out: string[] = [];
  for (const [certId, files] of byCert) {
    const first = files[0]!;
    const target = wanted(
      certId,
      { reportNo: first.report_no, reportDate: first.report_date, lab: first.lab },
      files,
    );
    if (files.some((f) => target.get(f.id) !== f.storage_path)) out.push(certId);
    if (out.length >= limit) break;
  }
  return out;
}
