import "server-only";

import { ALLOWED_TYPES, MAX_FILE_BYTES } from "@/lib/files/rules";

import { env } from "./env";

// A small client for the Supabase Storage REST API, used only on the server with the secret key.
// The bucket is private: files are never public, and every view or download goes through a link
// that this server signs for 60 seconds after checking who is asking.

export const BUCKET = "certificates";

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function config() {
  const e = env();
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return null;
  return {
    base: `${e.SUPABASE_URL}/storage/v1`,
    key: e.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function storageConfigured(): boolean {
  return config() !== null;
}

async function call(
  method: string,
  path: string,
  init: { json?: unknown; headers?: Record<string, string>; raw?: boolean } = {},
): Promise<Response> {
  const c = config();
  if (!c) throw new StorageError("File storage is not set up (SUPABASE_URL and key).", 503);
  const headers: Record<string, string> = { apikey: c.key, ...init.headers };
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys must not
  if (c.key.startsWith("eyJ")) headers.Authorization = `Bearer ${c.key}`;
  if (init.json !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${c.base}${path}`, {
    method,
    headers,
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok && !init.raw) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    let status = res.status;
    try {
      const body = JSON.parse(text) as { statusCode?: string };
      if (body.statusCode && /^\d{3}$/.test(body.statusCode)) status = Number(body.statusCode);
    } catch {
      // not JSON
    }
    throw new StorageError(`Storage ${method} failed (${status}): ${text}`, status);
  }
  return res;
}

const bucketSettings = {
  public: false,
  file_size_limit: MAX_FILE_BYTES,
  allowed_mime_types: Object.keys(ALLOWED_TYPES),
};

let bucketReady = false;

/** Creates the private bucket on first use, and makes it private again if someone changed it. */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  try {
    const res = await call("GET", `/bucket/${BUCKET}`);
    const bucket = (await res.json()) as { public?: boolean; file_size_limit?: number | null };
    if (bucket.public !== false || bucket.file_size_limit !== MAX_FILE_BYTES) {
      await call("PUT", `/bucket/${BUCKET}`, { json: { id: BUCKET, ...bucketSettings } });
    }
  } catch (error) {
    if (!(error instanceof StorageError) || (error.status !== 404 && error.status !== 400))
      throw error;
    await call("POST", "/bucket", { json: { id: BUCKET, name: BUCKET, ...bucketSettings } });
  }
  bucketReady = true;
}

/** For the health page: does the bucket exist, and is it private? */
export async function bucketStatus(): Promise<{ exists: boolean; private: boolean | null }> {
  try {
    const res = await call("GET", `/bucket/${BUCKET}`);
    const bucket = (await res.json()) as { public?: boolean };
    return { exists: true, private: bucket.public === false };
  } catch (error) {
    if (error instanceof StorageError && (error.status === 404 || error.status === 400)) {
      return { exists: false, private: null };
    }
    throw error;
  }
}

/** A one-time link the admin's browser uses to send one file straight to storage. */
export async function signedUploadUrl(path: string): Promise<string> {
  const c = config()!;
  const res = await call("POST", `/object/upload/sign/${BUCKET}/${path}`, {
    headers: { "x-upsert": "false" },
  });
  const data = (await res.json()) as { url?: string };
  if (!data.url?.includes("token=")) throw new StorageError("No upload link returned", 502);
  return `${c.base}${data.url}`;
}

/** Reads an uploaded file back for checking. Refuses anything larger than the limit. */
export async function downloadObject(
  path: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const res = await call("GET", `/object/${BUCKET}/${path}`, { raw: true });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new StorageError(`Storage download failed (${res.status})`, res.status);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new StorageError("File is larger than allowed", 413);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > maxBytes) throw new StorageError("File is larger than allowed", 413);
  return { bytes, contentType: res.headers.get("content-type") };
}

/** A link to one file that works for `seconds`; with `downloadAs` the browser saves it. */
export async function signedDownloadUrl(
  path: string,
  seconds: number,
  downloadAs?: string,
): Promise<string> {
  const c = config()!;
  const res = await call("POST", `/object/sign/${BUCKET}/${path}`, {
    json: { expiresIn: seconds },
  });
  const data = (await res.json()) as { signedURL?: string };
  if (!data.signedURL) throw new StorageError("No download link returned", 502);
  const extra = downloadAs ? `&download=${encodeURIComponent(downloadAs)}` : "";
  return `${c.base}${data.signedURL}${extra}`;
}

/** Links to many files at once (one storage call), each working for `seconds`. */
export async function signedDownloadUrls(
  paths: string[],
  seconds: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const c = config()!;
  const res = await call("POST", `/object/sign/${BUCKET}`, {
    json: { expiresIn: seconds, paths },
  });
  const data = (await res.json()) as { path?: string; signedURL?: string | null }[];
  for (const d of data) if (d.path && d.signedURL) out.set(d.path, `${c.base}${d.signedURL}`);
  return out;
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await call("DELETE", `/object/${BUCKET}`, { json: { prefixes: paths } });
}

/** Renames one file inside the bucket. Fails if something already has the new name. */
export async function moveObject(from: string, to: string): Promise<void> {
  await call("POST", "/object/move", {
    json: { bucketId: BUCKET, sourceKey: from, destinationKey: to },
  });
}
