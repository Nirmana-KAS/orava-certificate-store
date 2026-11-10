"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { detectKind } from "@/lib/files/inspect";
import { LOGO_MAX_BYTES } from "@/lib/labs";
import { audit, securityEvent } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
import { slugify } from "@/lib/types/schema";
import { fieldErrors, type FormState } from "@/lib/validation";

const LOGO_MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

const uuid = z.uuid();

const labSchema = z.object({
  name: z.string().trim().min(2, "Give the lab its full name.").max(120),
  shortName: z
    .string()
    .trim()
    .min(1, "Give a short name, for example AIGS.")
    .max(30, "Keep the short name under 30 characters.")
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} .&-]*$/u, "Use letters, numbers, spaces, . & or -."),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Start the website with https://"),
});

async function context() {
  const session = await requireAdmin();
  const client = await clientInfo();
  return { client, actor: { id: session.user.id, email: session.user.email } };
}

/** Creates (labId null) or updates a lab, with an optional new logo. */
export async function saveLabAction(
  labId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor, client } = await context();
  if (labId !== null && !uuid.safeParse(labId).success) return { error: "Unknown lab." };

  const values = {
    name: String(formData.get("name") ?? ""),
    shortName: String(formData.get("shortName") ?? ""),
    website: String(formData.get("website") ?? ""),
  };
  const parsed = labSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fields: fieldErrors(parsed.error),
      values,
    };
  }
  const lab = parsed.data;

  const [clash] = await db()`
    select 1 from labs
    where lower(short_name) = lower(${lab.shortName}) and id <> ${labId ?? "00000000-0000-0000-0000-000000000000"}
  `;
  if (clash) {
    return {
      error: "Please fix the highlighted fields.",
      fields: { shortName: "Another lab already has this short name." },
      values,
    };
  }

  // The logo: the browser already resized it; here the real bytes are checked
  let logo: { bytes: Uint8Array; mime: string } | null = null;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (file.size > LOGO_MAX_BYTES) {
      return { error: "The logo is too large (512 KB at most).", values };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectKind(bytes);
    if (kind !== "png" && kind !== "jpeg" && kind !== "webp") {
      await securityEvent("file_rejected", "medium", client, actor.email, {
        name: file.name.slice(0, 200),
        reason: `lab logo is ${kind ?? "unknown"}`,
      });
      return { error: "The logo must be a PNG, JPEG or WebP image.", values };
    }
    logo = { bytes, mime: LOGO_MIME[kind] };
  }
  const removeLogo = formData.get("removeLogo") === "1";

  if (labId === null) {
    const base = slugify(lab.shortName);
    let slug = base;
    for (let n = 2; n < 50; n++) {
      const [taken] = await db()`select 1 from labs where slug = ${slug}`;
      if (!taken) break;
      slug = `${base}-${n}`;
    }
    await db()`
      insert into labs (slug, name, short_name, website, logo, logo_mime, logo_updated_at,
                        created_by, sort_order)
      values (${slug}, ${lab.name}, ${lab.shortName}, ${lab.website},
              ${logo ? Buffer.from(logo.bytes) : null}, ${logo?.mime ?? null},
              case when ${!!logo} then now() end, ${actor.id},
              (select coalesce(max(sort_order), 0) + 1 from labs))
    `;
    await audit(actor, "lab.create", client, lab.name, { shortName: lab.shortName });
  } else {
    const done = await db().begin(async (tx) => {
      const rows = await tx`
        update labs set name = ${lab.name}, short_name = ${lab.shortName}, website = ${lab.website},
          updated_at = now()
        where id = ${labId} returning id
      `;
      if (rows.length === 0) return false;
      if (logo) {
        await tx`
          update labs set logo = ${Buffer.from(logo.bytes)}, logo_mime = ${logo.mime},
            logo_updated_at = now()
          where id = ${labId}
        `;
      } else if (removeLogo) {
        await tx`update labs set logo = null, logo_mime = null, logo_updated_at = null where id = ${labId}`;
      }
      // Types keep the short name for quick filtering
      await tx`update certificate_types set lab = ${lab.shortName} where lab_id = ${labId}`;
      return true;
    });
    if (!done) return { error: "This lab no longer exists." };
    await audit(actor, "lab.update", client, lab.name, {
      shortName: lab.shortName,
      logo: logo ? "replaced" : removeLogo ? "removed" : "kept",
    });
  }

  revalidatePath("/admin/labs");
  revalidatePath("/admin/types");
  revalidatePath("/admin/certificates");
  redirect("/admin/labs?saved=1");
}

/** A lab is hidden from new types, never deleted (types and certificates still point to it). */
export async function setLabArchivedAction(labId: string, archived: boolean): Promise<void> {
  const { actor, client } = await context();
  if (!uuid.safeParse(labId).success) return;
  const [row] = await db()<{ name: string }[]>`
    update labs set archived = ${archived}, updated_at = now() where id = ${labId} returning name
  `;
  if (!row) return;
  await audit(actor, archived ? "lab.archive" : "lab.restore", client, row.name);
  revalidatePath("/admin/labs");
}
