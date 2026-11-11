"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { findDuplicate, type DuplicateInfo } from "@/lib/server/duplicates";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireEditor } from "@/lib/server/session";
import { getType } from "@/lib/server/types";
import {
  coreColumns,
  inputName,
  keyPoints,
  parseEntry,
  renderTemplate,
  tableName,
  titleFor,
} from "@/lib/types/entry";

// Saving certificates that were read automatically from a file (Admin → Add from files).
// The browser reads the file; the server checks every value again with the type's rules,
// exactly like the manual form, before anything is stored.

const uuid = z.uuid();
const OCR_TEXT_MAX = 50_000;

const inputSchema = z.object({
  typeId: z.uuid(),
  /** Field values as the form would send them: text, or a list for multi-select */
  values: z.record(
    z.string().max(60),
    z.union([z.string().max(5000), z.array(z.string().max(200)).max(60)]),
  ),
  /** Table fields: rows of column values */
  tables: z
    .record(z.string().max(60), z.array(z.record(z.string().max(60), z.string().max(500))).max(200))
    .default({}),
  ocrText: z
    .string()
    .max(OCR_TEXT_MAX * 2)
    .default(""),
  meta: z
    .object({
      auto: z.boolean(),
      fileName: z.string().max(255),
      confidence: z.number().min(0).max(100),
      rotations: z.array(z.number().int()).max(10),
      ms: z.number().min(0).max(3_600_000),
      found: z.number().int().min(0).max(100),
      check: z.number().int().min(0).max(100),
      missing: z.number().int().min(0).max(100),
      typeScore: z.number().min(0).max(1),
      reread: z.boolean(),
    })
    .strict(),
  /**
   * The stored certificate with the same report number that this one replaces, when the admin
   * chose Replace. Without it, a duplicate is never saved.
   */
  replace: z.uuid().nullable().default(null),
  /** Fields still marked "check" when saved; the certificate is flagged for review */
  toCheck: z.array(z.string().max(60)).max(60).default([]),
});
export type ImportInput = z.input<typeof inputSchema>;

export type ImportResult =
  | { ok: true; id: string; title: string; replaced: boolean }
  | { ok: false; error: string; fields?: Record<string, string> }
  | { ok: false; duplicate: DuplicateInfo };

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";

export type { DuplicateInfo };

export async function importCertificateAction(input: unknown): Promise<ImportResult> {
  const session = await requireEditor();
  const client = await clientInfo();
  const actor = { id: session.user.id, email: session.user.email };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some of the values could not be read." };
  const { typeId, values, tables, ocrText, meta, replace, toCheck } = parsed.data;

  const type = await getType(typeId);
  if (!type) return { ok: false, error: "This certificate type no longer exists." };
  if (type.archived) {
    return { ok: false, error: "This type is archived. Restore it before adding certificates." };
  }

  // Same checks as the manual form: values are rebuilt as if they came from it
  const form = new Map<string, string[]>();
  for (const f of type.fields) {
    if (f.kind === "table") {
      form.set(tableName(f.key), [JSON.stringify(tables[f.key] ?? [])]);
    } else {
      const v = values[f.key];
      form.set(inputName(f.key), Array.isArray(v) ? v : v === undefined ? [] : [v]);
    }
  }
  const { data, errors } = parseEntry(
    type.fields,
    (n) => form.get(n)?.[0] ?? null,
    (n) => form.get(n) ?? [],
  );
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", fields: errors };
  }

  const core = coreColumns(type.fields, data);
  // One live certificate per report number: a duplicate is only saved by replacing the old one
  const dupe = core.report_no ? await findDuplicate(type.id, core.report_no) : null;
  if (dupe && dupe.id !== replace) return { ok: false, duplicate: dupe };

  const title = titleFor(type.name, core);
  const summary = renderTemplate(type.summaryTemplate, data);
  const points = keyPoints(type.fields, data);
  const known = new Set(type.fields.map((f) => f.key));
  const check = toCheck.filter((k) => known.has(k));
  const extraction = { ...meta, toCheck: check, typeVersion: type.version };

  let id: string;
  try {
    id = await db().begin(async (tx) => {
      if (dupe) {
        // The old one becomes history first, so the new one can take its report number
        await tx`
          update certificates set deleted_at = now(), replaced_at = now(), updated_at = now()
          where id = ${dupe.id} and deleted_at is null
        `;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into certificates
          (type_id, type_version, title, report_no, report_date, customer, identification,
           weight_ct, data, key_points, summary, ocr_text, extraction, needs_review, created_by)
        values (${type.id}, ${type.version}, ${title}, ${core.report_no}, ${core.report_date},
                ${core.customer}, ${core.identification}, ${core.weight_ct},
                ${tx.json(data as never)}, ${points}, ${summary},
                ${ocrText.slice(0, OCR_TEXT_MAX)}, ${tx.json(extraction as never)},
                ${check.length > 0}, ${actor.id})
        returning id
      `;
      if (dupe) {
        await tx`update certificates set replaced_by = ${row!.id} where id = ${dupe.id}`;
        // Versions the old one had replaced now belong to the new one
        await tx`update certificates set replaced_by = ${row!.id} where replaced_by = ${dupe.id}`;
      }
      return row!.id;
    });
  } catch (error) {
    // Someone saved the same report number a moment ago
    if (isUniqueViolation(error) && core.report_no) {
      const now = await findDuplicate(type.id, core.report_no);
      if (now) return { ok: false, duplicate: now };
    }
    throw error;
  }

  await audit(actor, meta.auto ? "certificate.import_auto" : "certificate.import", client, title, {
    type: type.name,
    file: meta.fileName,
    toCheck: check.length,
  });
  if (dupe) {
    await audit(actor, "certificate.replace", client, title, {
      replaced: dupe.id,
      reportNo: core.report_no,
    });
  }
  revalidatePath("/admin/certificates");
  revalidatePath("/upload/certificates");
  return { ok: true, id, title, replaced: !!dupe };
}

/**
 * Takes back a certificate that was just imported when its file could not be kept (for
 * example the same file is already stored). Only works on the admin's own import from the
 * last 30 minutes that has no files. If it replaced an older certificate, that one comes back.
 */
export async function discardImportAction(certId: string): Promise<void> {
  const session = await requireEditor();
  if (!uuid.safeParse(certId).success) return;
  const client = await clientInfo();
  const row = await db().begin(async (tx) => {
    const [taken] = await tx<{ title: string }[]>`
      update certificates set deleted_at = now(), deleted_by = ${session.user.id}, updated_at = now()
      where id = ${certId} and deleted_at is null and created_by = ${session.user.id}
        and created_at > now() - interval '30 minutes'
        and extraction is not null
        and not exists (
          select 1 from certificate_files f where f.certificate_id = certificates.id and f.status = 'ready'
        )
      returning title
    `;
    if (!taken) return null;
    // Bring back what it replaced: the newest replaced version becomes live again
    const [back] = await tx<{ id: string }[]>`
      select id from certificates where replaced_by = ${certId}
      order by replaced_at desc nulls last, created_at desc limit 1
    `;
    if (back) {
      await tx`
        update certificates set deleted_at = null, replaced_by = null, replaced_at = null,
          updated_at = now()
        where id = ${back.id}
      `;
      await tx`update certificates set replaced_by = ${back.id} where replaced_by = ${certId}`;
    }
    return taken;
  });
  if (!row) return;
  await audit(
    { id: session.user.id, email: session.user.email },
    "certificate.import_discard",
    client,
    row.title,
  );
  revalidatePath("/admin/certificates");
}
