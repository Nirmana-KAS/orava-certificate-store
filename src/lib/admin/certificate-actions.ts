"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
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
  const session = await requireAdmin();
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
  const title = titleFor(type.name, core);
  const summary = renderTemplate(type.summaryTemplate, data);
  const points = keyPoints(type.fields, data);
  const json = db().json(data as never);

  let id = certId;
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
  }

  revalidatePath("/admin/certificates");
  redirect(`/admin/certificates/${id}?saved=1`);
}

/** Soft delete: the record is hidden, not erased. */
export async function deleteCertificateAction(certId: string): Promise<void> {
  const session = await requireAdmin();
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
  redirect("/admin/certificates");
}
