"use client";

import { CircleAlert, CircleCheck, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  cancelUploadAction,
  finishUploadAction,
  startUploadAction,
} from "@/lib/admin/file-actions";
import { ACCEPT, MAX_FILE_BYTES, formatBytes, isAllowedMime } from "@/lib/files/rules";

type Item = {
  key: string;
  name: string;
  state: "sending" | "checking" | "done" | "error";
  progress: number;
  message?: string;
};

/** Sends a file straight to the private storage bucket with the one-time link, showing progress. */
function put(url: string, file: File, contentType: string, onProgress: (p: number) => void) {
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

export function FileUploader({
  certId,
  disabledReason,
}: {
  certId: string;
  disabledReason?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const busy = items.some((i) => i.state === "sending" || i.state === "checking");

  const update = (key: string, change: Partial<Item>) =>
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));

  async function send(file: File, key: string) {
    if (!isAllowedMime(file.type)) {
      return update(key, {
        state: "error",
        message: "Only PDF, JPEG, PNG or WebP files can be added.",
      });
    }
    if (file.size > MAX_FILE_BYTES) {
      return update(key, {
        state: "error",
        message: `Too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
      });
    }
    const started = await startUploadAction(certId, {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!started.ok) return update(key, { state: "error", message: started.error });

    try {
      await put(started.uploadUrl, file, started.contentType, (p) => update(key, { progress: p }));
    } catch {
      await cancelUploadAction(started.fileId);
      return update(key, {
        state: "error",
        message: "The upload was interrupted. Please try again.",
      });
    }

    update(key, { state: "checking", progress: 1 });
    const finished = await finishUploadAction(started.fileId);
    if (!finished.ok) return update(key, { state: "error", message: finished.error });
    update(key, { state: "done", message: "Checked and saved." });
  }

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).map((file, n) => ({ file, key: `${Date.now()}-${n}` }));
    setItems(
      picked.map(({ file, key }) => ({ key, name: file.name, state: "sending", progress: 0 })),
    );
    // One at a time keeps it reliable on slow mobile connections
    for (const { file, key } of picked) await send(file, key);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  if (disabledReason) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
        {disabledReason}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => void onPick(e.target.files)}
        disabled={busy}
      />
      <Button
        asChild
        variant="outline"
        size="lg"
        className="w-full sm:w-auto sm:justify-self-start"
        aria-disabled={busy}
      >
        <label
          htmlFor={inputId}
          className={busy ? "pointer-events-none opacity-60" : "cursor-pointer"}
        >
          <Upload /> Add PDF or scan
        </label>
      </Button>
      <p className="text-sm text-muted-foreground">
        PDF, JPEG, PNG or WebP, up to {formatBytes(MAX_FILE_BYTES)} each. Every file is checked
        after upload and kept private.
      </p>
      {items.length > 0 ? (
        <ul className="grid gap-2" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="grid gap-1 rounded-lg border px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                {i.state === "done" ? (
                  <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : i.state === "error" ? (
                  <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                ) : (
                  <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {i.state === "sending"
                    ? `${Math.round(i.progress * 100)}%`
                    : i.state === "checking"
                      ? "Checking…"
                      : null}
                </span>
              </div>
              {i.state === "sending" ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(i.progress * 100)}%` }}
                  />
                </div>
              ) : null}
              {i.message ? (
                <p
                  className={i.state === "error" ? "font-medium text-destructive" : "text-success"}
                >
                  {i.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
