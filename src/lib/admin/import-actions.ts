"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
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
  /** True when the admin chose to keep a second certificate with the same report number */
  allowDuplicate: z.boolean().default(false),
  /** Fields still marked "check" when saved; the certificate is flagged for review */
  toCheck: z.array(z.string().max(60)).max(60).default([]),
});
export type ImportInput = z.input<typeof inputSchema>;

export type ImportResult =
  | { ok: true; id: string; title: string }
  | { ok: false; error: string; fields?: Record<string, string> }
  | { ok: false; duplicate: { id: string; title: string } };

export async function importCertificateAction(input: unknown): Promise<ImportResult> {
  const session = await requireAdmin();
  const client = await clientInfo();
  const actor = { id: session.user.id, email: session.user.email };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some of the values could not be read." };
  const { typeId, values, tables, ocrText, meta, allowDuplicate, toCheck } = parsed.data;

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
  if (core.report_no && !allowDuplicate) {
    const [dupe] = await db()<{ id: string; title: string }[]>`
      select id, title from certificates
      where type_id = ${type.id} and deleted_at is null and lower(report_no) = lower(${core.report_no})
      limit 1
    `;
    if (dupe) return { ok: false, duplicate: dupe };
  }

  const title = titleFor(type.name, core);
  const summary = renderTemplate(type.summaryTemplate, data);
  const points = keyPoints(type.fields, data);
  const known = new Set(type.fields.map((f) => f.key));
  const check = toCheck.filter((k) => known.has(k));
  const extraction = { ...meta, toCheck: check, typeVersion: type.version };

  const [row] = await db()<{ id: string }[]>`
    insert into certificates
      (type_id, type_version, title, report_no, report_date, customer, identification, weight_ct,
       data, key_points, summary, ocr_text, extraction, needs_review, created_by)
    values (${type.id}, ${type.version}, ${title}, ${core.report_no}, ${core.report_date},
            ${core.customer}, ${core.identification}, ${core.weight_ct}, ${db().json(data as never)},
            ${points}, ${summary}, ${ocrText.slice(0, OCR_TEXT_MAX)},
            ${db().json(extraction as never)}, ${check.length > 0}, ${actor.id})
    returning id
  `;
  await audit(actor, meta.auto ? "certificate.import_auto" : "certificate.import", client, title, {
    type: type.name,
    file: meta.fileName,
    toCheck: check.length,
  });
  revalidatePath("/admin/certificates");
  return { ok: true, id: row!.id, title };
}

/**
 * Takes back a certificate that was just imported when its file could not be kept (for
 * example the same file is already stored). Only works on the admin's own import from the
 * last 30 minutes that has no files.
 */
export async function discardImportAction(certId: string): Promise<void> {
  const session = await requireAdmin();
  if (!uuid.safeParse(certId).success) return;
  const client = await clientInfo();
  const [row] = await db()<{ title: string }[]>`
    update certificates set deleted_at = now(), updated_at = now()
    where id = ${certId} and deleted_at is null and created_by = ${session.user.id}
      and created_at > now() - interval '30 minutes'
      and extraction is not null
      and not exists (
        select 1 from certificate_files f where f.certificate_id = certificates.id and f.status = 'ready'
      )
    returning title
  `;
  if (!row) return;
  await audit(
    { id: session.user.id, email: session.user.email },
    "certificate.import_discard",
    client,
    row.title,
  );
  revalidatePath("/admin/certificates");
}
