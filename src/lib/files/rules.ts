// File rules shared by the upload screen (quick check) and the server (the real check).

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB: a 300 dpi A4 scan is usually 1 to 5 MB
export const MAX_FILES_PER_CERTIFICATE = 10;

export const ALLOWED_TYPES = {
  "application/pdf": { kind: "pdf", ext: "pdf", label: "PDF" },
  "image/jpeg": { kind: "jpeg", ext: "jpg", label: "JPEG image" },
  "image/png": { kind: "png", ext: "png", label: "PNG image" },
  "image/webp": { kind: "webp", ext: "webp", label: "WebP image" },
} as const;

export type AllowedMime = keyof typeof ALLOWED_TYPES;
export type FileKind = (typeof ALLOWED_TYPES)[AllowedMime]["kind"];

export const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");

export function isAllowedMime(mime: string): mime is AllowedMime {
  return Object.hasOwn(ALLOWED_TYPES, mime);
}

/** "1.2 MB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A display-only file name: no folders, no control characters, not too long. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return (clean || "file").slice(0, 200);
}
