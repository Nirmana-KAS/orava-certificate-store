// Browser only: sends one file to a certificate through the private storage bucket.
// 1. the server checks the request and gives a one-time upload link,
// 2. the browser sends the file straight to storage (with progress),
// 3. the server re-reads the file and keeps it only if it passes every check.

import {
  cancelUploadAction,
  finishUploadAction,
  startUploadAction,
} from "@/lib/admin/file-actions";

import { imageFileToPdf } from "./image-to-pdf";
import { IMAGE_TYPES, MAX_FILE_BYTES, STORE_AS_PDF, formatBytes, isAllowedMime } from "./rules";

export type UploadOutcome = { ok: true } | { ok: false; error: string };

function put(url: string, file: Blob, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/** Problem with the file itself, found before anything is sent; null when it can be sent. */
export function fileProblem(file: File): string | null {
  if (!isAllowedMime(file.type)) return "Only PDF, JPEG, PNG or WebP files can be added.";
  if (file.size > MAX_FILE_BYTES) {
    return `Too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  return null;
}

/** A scan or photo becomes a one-page PDF; a PDF is sent as it is. */
export async function asStoredFile(file: File): Promise<File> {
  if (!STORE_AS_PDF || !(IMAGE_TYPES as readonly string[]).includes(file.type)) return file;
  return imageFileToPdf(file);
}

export async function uploadToCertificate(
  certId: string,
  picked: File,
  onProgress: (p: number) => void,
  onChecking?: () => void,
): Promise<UploadOutcome> {
  const problem = fileProblem(picked);
  if (problem) return { ok: false, error: problem };
  let file: File;
  try {
    file = await asStoredFile(picked);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "This image couldn't be turned into a PDF. Try another scan." };
  }
  const tooBig = fileProblem(file);
  if (tooBig) return { ok: false, error: tooBig };
  const started = await startUploadAction(certId, {
    // The name it was picked with, shown to the admin (the stored name is ReportNo_Date_Lab)
    name: picked.name,
    type: file.type,
    size: file.size,
  });
  if (!started.ok) return { ok: false, error: started.error };
  try {
    await put(started.uploadUrl, file, started.contentType, onProgress);
  } catch {
    await cancelUploadAction(started.fileId);
    return { ok: false, error: "The upload was interrupted. Please try again." };
  }
  onChecking?.();
  const finished = await finishUploadAction(started.fileId);
  return finished.ok ? { ok: true } : { ok: false, error: finished.error };
}
