"use client";

import { Download, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { finishBackupAction, startBackupAction } from "@/lib/admin/backup-actions";
import { browserDeflate, ZipWriter } from "@/lib/backup/zip";
import { formatBytes } from "@/lib/files/rules";

type FileRef = { id: string; path: string; size: number; url: string | null };

/** Above this, the browser is asked for a place to save, so the zip isn't kept in memory. */
const STREAM_ABOVE = 300 * 1024 * 1024;

type SaveHandle = {
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
};
type SavePicker = (o: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

class Cancelled extends Error {}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal, cache: "no-store" });
      if (res.status === 401 || res.status === 404) {
        throw new Error("Your admin sign-in ended. Sign in again, then start the backup again.");
      }
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      return (await res.json()) as T;
    } catch (error) {
      if (signal.aborted) throw new Cancelled();
      if (attempt >= 3 || (error as Error).message.startsWith("Your admin")) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function getFile(f: FileRef, signal: AbortSignal): Promise<Uint8Array | null> {
  if (!f.url) return null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(f.url, { signal, cache: "no-store", referrerPolicy: "no-referrer" });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      if (signal.aborted) throw new Cancelled();
    }
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  return null;
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const README = (when: Date, by: string, version: string, withFiles: boolean) =>
  [
    "Orava Certificate Store backup",
    "==============================",
    "",
    `Made ${when.toISOString()} by ${by}, app version ${version}.`,
    "",
    "database/<table>.json  every row of each table, as JSON (times in UTC).",
    "                       Lab logos are base64 text. Deleted certificates are included",
    "                       (deleted_at is set) so the Trash can be restored too.",
    withFiles
      ? "files/<path>          every certificate file, under the name it has in storage\n                       (certificate_files.storage_path)."
      : "                       This backup has no files (database only).",
    "manifest.json         what is inside, with row and file counts.",
    "",
    "Not included, on purpose: the shared passkey, upload passkeys, the admin password and",
    "authenticator secret, and sign-in sessions. After a restore they are set up again.",
    "",
    "This file holds every certificate. Keep it somewhere safe, like an encrypted drive.",
    "",
  ].join("\n");

type Progress = { label: string; done: number; total: number };

export function BackupPanel({
  files,
  fileBytes,
  storageReady,
}: {
  files: number;
  fileBytes: number;
  storageReady: boolean;
}) {
  const router = useRouter();
  const [withFiles, setWithFiles] = React.useState(storageReady && files > 0);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [result, setResult] = React.useState<{
    kind: "ok" | "error" | "warning";
    text: string;
  } | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  async function run() {
    setResult(null);
    const controller = new AbortController();
    abort.current = controller;
    const signal = controller.signal;
    const now = new Date();
    const name = `orava-backup_${stamp(now)}${withFiles ? "" : "_database"}.zip`;

    // Big backups go straight to a file where the browser can do that (Chrome, Edge on a
    // computer); otherwise the zip is put together in memory and then saved.
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    let disk: Awaited<ReturnType<SaveHandle["createWritable"]>> | null = null;
    if (withFiles && fileBytes > STREAM_ABOVE && picker) {
      try {
        const handle = await picker({
          suggestedName: name,
          types: [{ description: "Zip file", accept: { "application/zip": [".zip"] } }],
        });
        disk = await handle.createWritable();
      } catch {
        return; // the admin closed the save window
      }
    }

    setRunning(true);
    const chunks: Uint8Array[] = [];
    const zip = new ZipWriter(
      disk ? (c) => disk!.write(c) : (c) => void chunks.push(c),
      browserDeflate(),
    );
    let rows = 0;
    let saved = 0;
    let savedBytes = 0;
    const missing: string[] = [];
    const counts: Record<string, number> = {};

    try {
      const start = await startBackupAction(withFiles);

      for (const [i, table] of start.tables.entries()) {
        setProgress({
          label: `Database: ${table.replaceAll("_", " ")}`,
          done: i,
          total: start.tables.length,
        });
        const all: unknown[] = [];
        let after: string | null = null;
        do {
          const q = new URLSearchParams({ part: "table", name: table });
          if (after) q.set("after", after);
          const page: { rows: unknown[]; next: string | null } = await getJson(
            `/api/backup?${q}`,
            signal,
          );
          all.push(...page.rows);
          after = page.next;
        } while (after);
        counts[table] = all.length;
        rows += all.length;
        await zip.add(`database/${table}.json`, JSON.stringify(all, null, 1), {
          compress: true,
          date: now,
        });
      }

      if (withFiles) {
        let after: string | null = null;
        do {
          const q = new URLSearchParams({ part: "files" });
          if (after) q.set("after", after);
          const page: { files: FileRef[]; next: string | null } = await getJson(
            `/api/backup?${q}`,
            signal,
          );
          for (const f of page.files) {
            setProgress({
              label: `Files: ${formatBytes(savedBytes)} of ${formatBytes(fileBytes)}`,
              done: saved + missing.length,
              total: Math.max(files, saved + missing.length + 1),
            });
            const bytes = await getFile(f, signal);
            if (!bytes) {
              missing.push(f.path);
              continue;
            }
            await zip.add(`files/${f.path}`, bytes, { date: now });
            saved++;
            savedBytes += bytes.length;
          }
          after = page.next;
        } while (after);
      }

      setProgress({ label: "Finishing", done: 1, total: 1 });
      await zip.add(
        "manifest.json",
        JSON.stringify(
          {
            app: "Orava Certificate Store",
            format: 1,
            version: start.version,
            createdAt: now.toISOString(),
            createdBy: start.by,
            tables: counts,
            files: withFiles ? { saved, bytes: savedBytes, missing } : null,
          },
          null,
          2,
        ),
        { date: now },
      );
      await zip.add("README.txt", README(now, start.by, start.version, withFiles), { date: now });
      await zip.finish();

      if (disk) await disk.close();
      else {
        const url = URL.createObjectURL(
          new Blob(chunks as BlobPart[], { type: "application/zip" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }

      await finishBackupAction({
        withFiles,
        rows,
        files: saved,
        bytes: zip.size,
        missing: missing.length,
      });
      setResult(
        missing.length
          ? {
              kind: "warning",
              text: `Backup saved (${formatBytes(zip.size)}), but ${missing.length} file${missing.length === 1 ? "" : "s"} couldn't be read from storage. Their names are in manifest.json. Try again later.`,
            }
          : {
              kind: "ok",
              text: `Backup saved as ${name} (${formatBytes(zip.size)}): ${rows.toLocaleString("en-GB")} database rows${withFiles ? ` and ${saved} file${saved === 1 ? "" : "s"}` : ""}.`,
            },
      );
      router.refresh();
    } catch (error) {
      await disk?.abort().catch(() => {});
      setResult(
        error instanceof Cancelled
          ? { kind: "warning", text: "Backup stopped. Nothing was saved." }
          : {
              kind: "error",
              text: `The backup didn't finish: ${(error as Error).message || "unknown problem"} Nothing was saved.`,
            },
      );
    } finally {
      setRunning(false);
      setProgress(null);
      abort.current = null;
    }
  }

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2" disabled={running}>
        <legend className="mb-2 text-sm font-medium">What to include</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name="backup-kind"
            checked={withFiles}
            onChange={() => setWithFiles(true)}
            disabled={!storageReady || files === 0}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
          />
          <span>
            <span className="font-medium">Everything</span>: database and all {files} file
            {files === 1 ? "" : "s"} ({formatBytes(fileBytes)})
            {!storageReady ? (
              <span className="block text-muted-foreground">File storage isn&apos;t set up.</span>
            ) : null}
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name="backup-kind"
            checked={!withFiles}
            onChange={() => setWithFiles(false)}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
          />
          <span>
            <span className="font-medium">Database only</span>: quick and small, without the PDF and
            image files
          </span>
        </label>
      </fieldset>

      <div className="grid gap-3 sm:flex sm:flex-wrap">
        <Button size="lg" onClick={run} disabled={running} className="w-full sm:w-auto">
          {running ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download />}
          {running ? "Making backup…" : "Download backup"}
        </Button>
        {running ? (
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => abort.current?.abort()}
          >
            <X /> Stop
          </Button>
        ) : null}
      </div>

      {progress ? (
        <div className="grid gap-2" aria-live="polite">
          <p className="text-sm wrap-anywhere">{progress.label}</p>
          <progress
            className="h-2 w-full overflow-hidden rounded-full accent-primary"
            value={pct}
            max={100}
            aria-label="Backup progress"
          >
            {pct}%
          </progress>
        </div>
      ) : null}

      {result ? (
        <Alert variant={result.kind === "ok" ? "success" : result.kind} data-testid="backup-result">
          <span className="wrap-anywhere">{result.text}</span>
        </Alert>
      ) : null}
    </div>
  );
}
