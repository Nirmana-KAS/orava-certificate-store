"use client";

import { CircleAlert, CircleCheck, CircleDashed, LoaderCircle, ScanText } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { extractFields, fuzzyFind, norm, type FieldResult } from "@/lib/extract/extract";
import { readCertificate, type CertificateReading } from "@/lib/extract/read-certificate";
import { ACCEPT } from "@/lib/files/rules";
import { fileProblem } from "@/lib/files/upload-client";
import { stopReader, type ReadProgress } from "@/lib/ocr/engine";
import type { FieldDef } from "@/lib/types/schema";

const show = (r: FieldResult): string => {
  const v = r.value;
  if (v === null) return "";
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === "string")) return (v as string[]).join(", ") || "none ticked";
    return `${v.length} row${v.length === 1 ? "" : "s"}`;
  }
  return v;
};

/**
 * "Test with a sample": reads a file with the hints as they are right now in the editor and
 * shows which fields were found. Nothing is uploaded or saved.
 */
export function SampleTester({
  fields,
  fingerprints,
}: {
  fields: FieldDef[];
  fingerprints: string[];
}) {
  const inputId = useId();
  const [reading, setReading] = useState<CertificateReading | null>(null);
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => () => void stopReader(), []);

  // Re-checked instantly whenever the hints change: the file is only read once
  const ex = useMemo(
    () => (reading ? extractFields(reading.read.pages, fields) : null),
    [reading, fields],
  );
  const fpHits = useMemo(() => {
    if (!reading) return [];
    const text = norm(reading.text);
    return fingerprints.map((fp) => ({
      fp,
      found: fuzzyFind(text, norm(fp)) <= Math.floor(norm(fp).length / 8),
    }));
  }, [reading, fingerprints]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    setName(file.name);
    try {
      setReading(await readCertificate(file, [], setProgress));
    } catch (e) {
      console.error(e);
      setError("This file couldn't be read. Try a clearer scan.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold">Test with a sample</h3>
        <p className="text-sm text-muted-foreground">
          Pick one certificate of this type. It is read on this device and shows which fields the
          hints above can find. Nothing is uploaded or saved.
        </p>
      </div>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button asChild variant="outline" className="w-full sm:w-auto sm:justify-self-start">
        <label
          htmlFor={inputId}
          className={busy ? "pointer-events-none opacity-60" : "cursor-pointer"}
          aria-disabled={busy}
        >
          <ScanText /> {reading ? "Try another sample" : "Choose a sample file"}
        </label>
      </Button>
      {busy ? (
        <p className="flex items-center gap-2 text-sm" role="status">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {progress?.stage === "reading"
            ? `Reading ${name}… ${Math.round(progress.progress * 100)}%`
            : `Opening ${name}…`}
        </p>
      ) : null}
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

      {reading && ex && !busy ? (
        <div className="grid gap-4">
          <p className="text-sm">
            <span className="font-medium">{name}</span>: {ex.found} found
            {ex.check ? `, ${ex.check} to check` : ""}
            {ex.missing ? `, ${ex.missing} not found` : ""}.
          </p>
          {fpHits.length ? (
            <ul className="grid gap-1 text-sm">
              {fpHits.map((h) => (
                <li key={h.fp} className="flex items-start gap-2">
                  {h.found ? (
                    <CircleCheck
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleDashed
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 break-words">
                    Phrase &ldquo;{h.fp}&rdquo; {h.found ? "found" : "not found"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="grid gap-2">
            {fields.map((f) => {
              const r = ex.fields[f.key];
              if (!r) return null;
              return (
                <li key={f.key} className="flex min-w-0 items-start gap-2 text-sm">
                  {r.status === "found" ? (
                    <CircleCheck
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : r.status === "check" ? (
                    <CircleAlert
                      className="mt-0.5 size-4 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleDashed
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{f.label || f.key}</span>:{" "}
                    {r.status === "missing" ? (
                      <span className="text-muted-foreground">not found</span>
                    ) : (
                      <>
                        {show(r)}
                        {r.status === "check" ? (
                          <span className="text-muted-foreground">
                            {" "}
                            (check{r.note ? `: ${r.note}` : ""})
                          </span>
                        ) : null}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="min-h-11 cursor-pointer content-center font-medium">
              Text that was read (copy label words from here)
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto text-xs break-words whitespace-pre-wrap">
              {reading.text}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
