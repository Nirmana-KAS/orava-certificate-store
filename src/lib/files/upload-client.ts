// Browser only: sends one file to a certificate through the private storage bucket.
// 1. the server checks the request and gives a one-time upload link,
// 2. the browser sends the file straight to storage (with progress),
// 3. the server re-reads the file and keeps it only if it passes every check.

import {
  cancelUploadAction,
  finishUploadAction,
  startUploadAction,
} from "@/lib/admin/file-actions";

import { MAX_FILE_BYTES, formatBytes, isAllowedMime } from "./rules";

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

export async function uploadToCertificate(
  certId: string,
  file: File,
  onProgress: (p: number) => void,
  onChecking?: () => void,
): Promise<UploadOutcome> {
  const problem = fileProblem(file);
  if (problem) return { ok: false, error: problem };
  const started = await startUploadAction(certId, {
    name: file.name,
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
