"use client";

import { CircleAlert, CircleCheck, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ACCEPT, MAX_FILE_BYTES, formatBytes } from "@/lib/files/rules";
import { uploadToCertificate } from "@/lib/files/upload-client";

type Item = {
  key: string;
  name: string;
  state: "sending" | "checking" | "done" | "error";
  progress: number;
  message?: string;
};

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
    const outcome = await uploadToCertificate(
      certId,
      file,
      (p) => update(key, { progress: p }),
      () => update(key, { state: "checking", progress: 1 }),
    );
    if (!outcome.ok) return update(key, { state: "error", message: outcome.error });
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
        A PDF, or a scan or photo (JPEG, PNG, WebP) which is turned into a PDF first. Up to{" "}
        {formatBytes(MAX_FILE_BYTES)} each. Every file is checked after upload, kept private and
        named Report number_Date_Lab.
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
