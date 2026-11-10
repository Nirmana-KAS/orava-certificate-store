"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { findDuplicate } from "@/lib/server/duplicates";
import { certificatesWithOldNames, syncFileNames } from "@/lib/server/file-names";
import { clientInfo } from "@/lib/server/request";
import { certificatesBase, requireAdmin, requireEditor } from "@/lib/server/session";
import { getType } from "@/lib/server/types";
import { coreColumns, keyPoints, parseEntry, renderTemplate, titleFor } from "@/lib/types/entry";
import type { FormState } from "@/lib/validation";

const uuid = z.uuid();

/** Creates (certId null) or updates a certificate from the form built for its type. */
export async function saveCertificateAction(
  typeId: string,
  certId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // The admin, or an uploader in upload mode
  const session = await requireEditor();
  const client = await clientInfo();
  const actor = { id: session.user.id, email: session.user.email };

  if (!uuid.safeParse(typeId).success || (certId !== null && !uuid.safeParse(certId).success)) {
    return { error: "Unknown certificate." };
  }
  const type = await getType(typeId);
  if (!type) return { error: "This certificate type no longer exists." };
  if (type.archived && certId === null) {
    return { error: "This type is archived. Restore it before adding certificates." };
  }

  const { data, errors } = parseEntry(
    type.fields,
    (n) => {
      const v = formData.get(n);
      return typeof v === "string" ? v : null;
    },
    (n) => formData.getAll(n).filter((v): v is string => typeof v === "string"),
  );
  if (Object.keys(errors).length > 0) {
    // Give the typed values back so the form keeps them while the admin fixes the problem
    const values: Record<string, string> = {};
    for (const [key, v] of formData.entries()) {
      if (typeof v === "string" && key.startsWith("f_")) {
        values[key] = key in values ? `${values[key]}\n${v}` : v;
      }
    }
    return { error: "Please fix the highlighted fields.", fields: errors, values };
  }

  const core = coreColumns(type.fields, data);
  // One certificate per report number (within a lab): never a second copy
  const dupe = core.report_no ? await findDuplicate(type.id, core.report_no) : null;
  const sameNumber = () => {
    const values: Record<string, string> = {};
    for (const [key, v] of formData.entries()) {
      if (typeof v === "string" && key.startsWith("f_")) {
        values[key] = key in values ? `${values[key]}\n${v}` : v;
      }
    }
    return {
      error: `Report number ${core.report_no} is already stored as "${dupe?.title ?? "another certificate"}". Open that certificate to change it, or use Add from files and choose Replace.`,
      values,
    };
  };
  if (dupe && dupe.id !== certId) return sameNumber();
  const title = titleFor(type.name, core);
  const summary = renderTemplate(type.summaryTemplate, data);
  const points = keyPoints(type.fields, data);
  const json = db().json(data as never);

  let id = certId;
  try {
    if (certId === null) {
      const [row] = await db()<{ id: string }[]>`
      insert into certificates
        (type_id, type_version, title, report_no, report_date, customer, identification, weight_ct,
         data, key_points, summary, created_by)
      values (${type.id}, ${type.version}, ${title}, ${core.report_no}, ${core.report_date},
              ${core.customer}, ${core.identification}, ${core.weight_ct}, ${json}, ${points},
              ${summary}, ${actor.id})
      returning id
    `;
      id = row!.id;
      await audit(actor, "certificate.create", client, title, { type: type.name });
    } else {
      const rows = await db()`
      update certificates set
        type_version = ${type.version}, title = ${title}, report_no = ${core.report_no},
        report_date = ${core.report_date}, customer = ${core.customer},
        identification = ${core.identification}, weight_ct = ${core.weight_ct}, data = ${json},
        key_points = ${points}, summary = ${summary}, needs_review = false, updated_at = now()
      where id = ${certId} and type_id = ${type.id} and deleted_at is null
      returning id
    `;
      if (rows.length === 0) return { error: "This certificate no longer exists." };
      await audit(actor, "certificate.update", client, title, { type: type.name });
      // A new report number or date renames the stored files to match
      await syncFileNames(certId).catch((e) => console.error("rename after edit", e));
    }
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "23505") return sameNumber();
    throw error;
  }

  revalidatePath("/admin/certificates");
  revalidatePath("/upload/certificates");
  redirect(`${certificatesBase(session.area)}/${id}?saved=1`);
}

/** Soft delete: the record is hidden, not erased. */
export async function deleteCertificateAction(certId: string): Promise<void> {
  // Uploaders may delete too; only the admin can bring a deleted certificate back (Phase 5)
  const session = await requireEditor();
  const client = await clientInfo();
  if (!uuid.safeParse(certId).success) return;
  const [row] = await db()<{ title: string }[]>`
    update certificates set deleted_at = now(), updated_at = now()
    where id = ${certId} and deleted_at is null returning title
  `;
  if (!row) return;
  await audit(
    { id: session.user.id, email: session.user.email },
    "certificate.delete",
    client,
    row.title,
  );
  revalidatePath("/admin/certificates");
  revalidatePath("/upload/certificates");
  redirect(session.area === "admin" ? "/admin/certificates" : "/upload");
}

/**
 * Brings back a version that was replaced: it becomes the live certificate again, and the one
 * that replaced it is kept as history in its place.
 */
export async function restoreVersionAction(oldId: string): Promise<void> {
  const session = await requireAdmin();
  const client = await clientInfo();
  if (!uuid.safeParse(oldId).success) return;
  const restored = await db().begin(async (tx) => {
    const [old] = await tx<{ title: string; current: string }[]>`
      select o.title, o.replaced_by as current
      from certificates o join certificates c on c.id = o.replaced_by
      where o.id = ${oldId} and o.deleted_at is not null and c.deleted_at is null
      for update of o, c
    `;
    if (!old) return null;
    await tx`
      update certificates set deleted_at = now(), replaced_at = now(), replaced_by = ${oldId},
        updated_at = now()
      where id = ${old.current}
    `;
    await tx`
      update certificates set replaced_by = ${oldId}
      where replaced_by = ${old.current} and id <> ${oldId}
    `;
    await tx`
      update certificates set deleted_at = null, replaced_by = null, replaced_at = null,
        updated_at = now()
      where id = ${oldId}
    `;
    return old;
  });
  if (!restored) return;
  await audit(
    { id: session.user.id, email: session.user.email },
    "certificate.restore_version",
    client,
    restored.title,
    { replaced: restored.current },
  );
  revalidatePath("/admin/certificates");
  redirect(`/admin/certificates/${oldId}?restored=1`);
}

/** Renames stored files to ReportNo_Date_Lab, a batch of certificates at a time. */
export async function renameStoredFilesAction(): Promise<void> {
  const session = await requireAdmin();
  const client = await clientInfo();
  const certs = await certificatesWithOldNames(25);
  let renamed = 0;
  for (const id of certs) renamed += await syncFileNames(id).catch(() => 0);
  await audit(
    { id: session.user.id, email: session.user.email },
    "file.rename_standard",
    client,
    `${renamed} file${renamed === 1 ? "" : "s"}`,
    { certificates: certs.length },
  );
  revalidatePath("/admin/certificates");
}
