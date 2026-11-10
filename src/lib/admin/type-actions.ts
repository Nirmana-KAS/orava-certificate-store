"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
import { slugify, typeInputSchema } from "@/lib/types/schema";
import type { FormState } from "@/lib/validation";

const uuid = z.uuid();

async function context() {
  const session = await requireAdmin();
  const client = await clientInfo();
  return { client, actor: { id: session.user.id, email: session.user.email } };
}

/** Creates a type (typeId null) or saves a new version of an existing one. */
export async function saveTypeAction(
  typeId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor, client } = await context();
  if (typeId !== null && !uuid.safeParse(typeId).success) return { error: "Unknown type." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("config") ?? ""));
  } catch {
    return { error: "The form could not be read. Please reload the page and try again." };
  }
  const parsed = typeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const t = parsed.data;
  const fieldsJson = db().json(t.fields as never);

  // The lab's short name is kept on the type too, for quick filtering
  let lab = "";
  if (t.labId) {
    const [row] = await db()<{ short_name: string }[]>`
      select short_name from labs where id = ${t.labId}
    `;
    if (!row) return { error: "The chosen lab no longer exists. Please choose another." };
    lab = row.short_name;
  }

  if (typeId === null) {
    const base = slugify(t.name);
    let slug = base;
    for (let n = 2; n < 50; n++) {
      const [taken] = await db()`select 1 from certificate_types where slug = ${slug}`;
      if (!taken) break;
      slug = `${base}-${n}`;
    }
    const [row] = await db()<{ id: string }[]>`
      insert into certificate_types
        (slug, name, lab, lab_id, category, description, icon, color, expiry_tracking,
         expiry_warning_days, fields, fingerprints, summary_template, created_by, sort_order)
      values (${slug}, ${t.name}, ${lab}, ${t.labId}, ${t.category}, ${t.description}, ${t.icon}, ${t.color},
              ${t.expiryTracking}, ${t.expiryWarningDays}, ${fieldsJson}, ${t.fingerprints},
              ${t.summaryTemplate}, ${actor.id},
              (select coalesce(max(sort_order), 0) + 1 from certificate_types))
      returning id
    `;
    await audit(actor, "type.create", client, t.name, { slug });
    revalidatePath("/admin/types");
    redirect(`/admin/types/${row!.id}?saved=1`);
  }

  const done = await db().begin(async (tx) => {
    const [old] = await tx<{ version: number; snapshot: unknown }[]>`
      select version, to_jsonb(certificate_types) as snapshot
      from certificate_types where id = ${typeId} for update
    `;
    if (!old) return false;
    await tx`
      insert into certificate_type_versions (type_id, version, snapshot, changed_by)
      values (${typeId}, ${old.version}, ${tx.json(old.snapshot as never)}, ${actor.id})
      on conflict do nothing
    `;
    await tx`
      update certificate_types set
        name = ${t.name}, lab = ${lab}, lab_id = ${t.labId}, category = ${t.category},
        description = ${t.description}, icon = ${t.icon},
        color = ${t.color}, expiry_tracking = ${t.expiryTracking},
        expiry_warning_days = ${t.expiryWarningDays}, fields = ${tx.json(t.fields as never)},
        fingerprints = ${t.fingerprints}, summary_template = ${t.summaryTemplate},
        version = version + 1, updated_at = now()
      where id = ${typeId}
    `;
    return true;
  });
  if (!done) return { error: "This type no longer exists." };

  await audit(actor, "type.update", client, t.name);
  revalidatePath("/admin/types");
  revalidatePath(`/admin/types/${typeId}`);
  redirect(`/admin/types/${typeId}?saved=1`);
}

/** A type with certificates is archived (hidden from new uploads), never deleted. */
export async function setTypeArchivedAction(typeId: string, archived: boolean): Promise<void> {
  const { actor, client } = await context();
  if (!uuid.safeParse(typeId).success) return;
  const [row] = await db()<{ name: string }[]>`
    update certificate_types set archived = ${archived}, updated_at = now()
    where id = ${typeId} returning name
  `;
  if (!row) return;
  await audit(actor, archived ? "type.archive" : "type.restore", client, row.name);
  revalidatePath("/admin/types");
}
