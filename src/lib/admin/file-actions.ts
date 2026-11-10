"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { detectKind, pdfRisks, sha256 } from "@/lib/files/inspect";
import {
  ALLOWED_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_CERTIFICATE,
  STORE_AS_PDF,
  cleanFileName,
  formatBytes,
  isAllowedMime,
} from "@/lib/files/rules";
import { audit, securityEvent } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { pathForNewFile, syncFileNames } from "@/lib/server/file-names";
import { clientInfo } from "@/lib/server/request";
import { requireEditor } from "@/lib/server/session";
import {
  downloadObject,
  ensureBucket,
  removeObjects,
  signedUploadUrl,
  storageConfigured,
} from "@/lib/server/storage";

const uuid = z.uuid();

const startSchema = z.object({
  name: z.string().max(1000),
  type: z.string().max(100),
  size: z.number().int().min(1),
});

type Started =
  | { ok: true; fileId: string; uploadUrl: string; contentType: string }
  | { ok: false; error: string };
type Finished = { ok: true } | { ok: false; error: string };

async function context() {
  const session = await requireEditor();
  const client = await clientInfo();
  return { client, actor: { id: session.user.id, email: session.user.email } };
}

/** Both places a certificate's page can be open: the admin's and the uploader's */
function revalidateCertificate(certId: string) {
  revalidatePath(`/admin/certificates/${certId}`);
  revalidatePath(`/upload/certificates/${certId}`);
  revalidatePath("/admin/certificates");
  revalidatePath("/upload");
}

/** Removes uploads that were started more than an hour ago and never finished. */
async function clearStale(certId: string) {
  const stale = await db()<{ id: string; storage_path: string }[]>`
    select id, storage_path from certificate_files
    where certificate_id = ${certId} and status = 'pending' and created_at < now() - interval '1 hour'
  `;
  if (stale.length === 0) return;
  await removeObjects(stale.map((s) => s.storage_path)).catch(() => {});
  await db()`delete from certificate_files where id in ${db()(stale.map((s) => s.id))}`;
}

/**
 * Step 1: checks the request and returns a one-time link. The browser then sends the file
 * straight to the private bucket (so large scans don't pass through this server).
 */
export async function startUploadAction(certId: string, file: unknown): Promise<Started> {
  const { actor, client } = await context();
  if (!storageConfigured()) {
    return {
      ok: false,
      error: "File storage isn't set up yet. See the setup steps in the README.",
    };
  }
  const parsed = startSchema.safeParse(file);
  if (!uuid.safeParse(certId).success || !parsed.success)
    return { ok: false, error: "Invalid upload." };
  const { name, type, size } = parsed.data;

  if (!isAllowedMime(type) || (STORE_AS_PDF && type !== "application/pdf"))
    return { ok: false, error: "Only PDF files can be stored." };
  if (size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `This file is ${formatBytes(size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
    };
  }

  const [cert] = await db()<{ id: string }[]>`
    select id from certificates where id = ${certId} and deleted_at is null
  `;
  if (!cert) return { ok: false, error: "This certificate no longer exists." };

  await clearStale(certId);
  const [{ n } = { n: 0 }] = await db()<{ n: number }[]>`
    select count(*)::int as n from certificate_files where certificate_id = ${certId}
  `;
  if (n >= MAX_FILES_PER_CERTIFICATE) {
    return { ok: false, error: `A certificate can have up to ${MAX_FILES_PER_CERTIFICATE} files.` };
  }

  // Stored under the standard name ReportNo_Date_Lab; the original name is only shown on screen
  const fileId = randomUUID();
  const info = ALLOWED_TYPES[type];

  try {
    const path = await pathForNewFile(certId, type);
    await ensureBucket();
    const uploadUrl = await signedUploadUrl(path);
    await db()`
      insert into certificate_files
        (id, certificate_id, kind, mime, storage_path, original_name, size_bytes, created_by)
      values (${fileId}, ${certId}, ${info.kind}, ${type}, ${path}, ${cleanFileName(name)}, ${size}, ${actor.id})
    `;
    return { ok: true, fileId, uploadUrl, contentType: type };
  } catch (error) {
    console.error("start upload failed", error);
    await securityEvent("storage_error", "medium", client, actor.email, { step: "start" });
    return { ok: false, error: "File storage didn't answer. Please try again in a minute." };
  }
}

async function reject(
  file: { id: string; storage_path: string; original_name: string },
  reason: string,
  ctx: Awaited<ReturnType<typeof context>>,
  severity: "low" | "medium" | "high" = "medium",
) {
  await removeObjects([file.storage_path]).catch((e) => console.error("remove rejected file", e));
  await db()`delete from certificate_files where id = ${file.id}`;
  await securityEvent("file_rejected", severity, ctx.client, ctx.actor.email, {
    name: file.original_name,
    reason,
  });
}

/**
 * Step 2: after the browser has sent the file, read it back from storage and check the real
 * bytes. Anything that fails is deleted straight away.
 */
export async function finishUploadAction(fileId: string): Promise<Finished> {
  const ctx = await context();
  if (!uuid.safeParse(fileId).success) return { ok: false, error: "Invalid upload." };

  const [file] = await db()<
    {
      id: string;
      certificate_id: string;
      kind: string;
      mime: string;
      storage_path: string;
      original_name: string;
    }[]
  >`
    select id, certificate_id, kind, mime, storage_path, original_name
    from certificate_files where id = ${fileId} and status = 'pending'
  `;
  if (!file) return { ok: false, error: "This upload has expired. Please add the file again." };

  let stored;
  try {
    stored = await downloadObject(file.storage_path, MAX_FILE_BYTES);
  } catch (error) {
    console.error("read back failed", error);
    await reject(file, "could not be read back (too large or storage error)", ctx);
    return { ok: false, error: `"${file.original_name}" couldn't be checked, so it was not kept.` };
  }
  if (!stored) {
    await db()`delete from certificate_files where id = ${file.id}`;
    return { ok: false, error: `"${file.original_name}" didn't arrive. Please try again.` };
  }

  const actual = detectKind(stored.bytes);
  if (actual !== file.kind) {
    await reject(file, `content is ${actual ?? "unknown"}, expected ${file.kind}`, ctx, "high");
    return {
      ok: false,
      error: `"${file.original_name}" is not a real ${ALLOWED_TYPES[file.mime as keyof typeof ALLOWED_TYPES]?.label ?? "file"}, so it was removed.`,
    };
  }
  const storedType = stored.contentType?.split(";")[0]?.trim().toLowerCase();
  if (storedType && storedType !== file.mime) {
    await reject(file, `stored as ${storedType}, expected ${file.mime}`, ctx, "high");
    return {
      ok: false,
      error: `"${file.original_name}" was sent with the wrong file type, so it was removed.`,
    };
  }
  if (actual === "pdf") {
    const risks = pdfRisks(stored.bytes);
    if (risks.length > 0) {
      await reject(file, `PDF contains ${risks.join(", ")}`, ctx, "high");
      return {
        ok: false,
        error: `"${file.original_name}" contains ${risks.join(", ")}, which a certificate scan never needs, so it was removed. Please re-save it as a plain PDF or upload the image.`,
      };
    }
  }

  const hash = sha256(stored.bytes);
  const [dupe] = await db()<{ title: string }[]>`
    select c.title from certificate_files f join certificates c on c.id = f.certificate_id
    where f.sha256 = ${hash} and f.status = 'ready' and c.deleted_at is null
    limit 1
  `;
  if (dupe) {
    await reject(file, "duplicate", ctx, "low");
    return { ok: false, error: `"${file.original_name}" is already attached to "${dupe.title}".` };
  }

  await db()`
    update certificate_files
    set status = 'ready', sha256 = ${hash}, size_bytes = ${stored.bytes.length}, verified_at = now()
    where id = ${file.id}
  `;
  await audit(ctx.actor, "file.upload", ctx.client, file.original_name, {
    certificate: file.certificate_id,
    kind: file.kind,
    bytes: stored.bytes.length,
  });
  revalidateCertificate(file.certificate_id);
  return { ok: true };
}

/** Cleans up an upload the browser could not finish. */
export async function cancelUploadAction(fileId: string): Promise<void> {
  await requireEditor();
  if (!uuid.safeParse(fileId).success) return;
  const [file] = await db()<{ id: string; storage_path: string }[]>`
    delete from certificate_files where id = ${fileId} and status = 'pending'
    returning id, storage_path
  `;
  if (file) await removeObjects([file.storage_path]).catch(() => {});
}

export async function removeFileAction(fileId: string): Promise<void> {
  const { actor, client } = await context();
  if (!uuid.safeParse(fileId).success) return;
  const [file] = await db()<
    { certificate_id: string; storage_path: string; original_name: string }[]
  >`
    select certificate_id, storage_path, original_name from certificate_files where id = ${fileId}
  `;
  if (!file) return;
  await removeObjects([file.storage_path]);
  await db()`delete from certificate_files where id = ${fileId}`;
  // Close the gap in the numbering (_2, _3…)
  await syncFileNames(file.certificate_id).catch((e) => console.error("rename after remove", e));
  await audit(actor, "file.remove", client, file.original_name, {
    certificate: file.certificate_id,
  });
  revalidateCertificate(file.certificate_id);
}
