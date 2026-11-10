"use client";

import {
  CircleAlert,
  CircleCheck,
  FileText,
  LoaderCircle,
  RotateCcw,
  ScanText,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { CertificateFields } from "@/components/admin/certificate-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  discardImportAction,
  importCertificateAction,
  type DuplicateInfo,
} from "@/lib/admin/import-actions";
import {
  readyToSave,
  type Extraction,
  type FieldResult,
  type TypeForDetect,
} from "@/lib/extract/extract";
import {
  fillFields,
  readCertificate,
  type CertificateReading,
} from "@/lib/extract/read-certificate";
import { ACCEPT, STORE_AS_PDF, formatBytes } from "@/lib/files/rules";
import { fileProblem, uploadToCertificate } from "@/lib/files/upload-client";
import { formatDateTime } from "@/lib/format";
import { stopReader, type ReadProgress } from "@/lib/ocr/engine";
import { inputName, tableName, type EntryData } from "@/lib/types/entry";
import type { FieldDef } from "@/lib/types/schema";

export type ImportType = TypeForDetect & { lab: string };

type State =
  "waiting" | "reading" | "review" | "saving" | "saved" | "duplicate" | "skipped" | "error";

type Payload = ReturnType<typeof toPayload>;
type SaveOpts = { auto: boolean; toCheck: string[]; replace?: string };
/** What to do with the next duplicates in this batch, once the admin has chosen for one */
type DupPolicy = "ask" | "replace" | "skip";

type Item = {
  key: string;
  file: File;
  state: State;
  progress?: ReadProgress;
  upload?: number;
  reading?: CertificateReading;
  typeId: string | null;
  extraction?: Extraction;
  reread?: boolean;
  /** Bumped to rebuild the review form when its values change underneath it */
  formKey: number;
  saved?: { id: string; title: string; auto: boolean; toCheck: number; replaced: boolean };
  duplicate?: DuplicateInfo;
  /** The values that met the duplicate, saved as they are if the admin chooses Replace */
  pending?: { payload: Payload; opts: SaveOpts };
  error?: string;
  fieldErrors?: Record<string, string>;
};

const STAGE_TEXT: Record<ReadProgress["stage"], string> = {
  starting: "Starting the reader (the first file takes a little longer)…",
  opening: "Opening the file…",
  turning: "Finding which way is up…",
  reading: "Reading the text…",
  rereading: "Taking a second look at unclear fields…",
};

function progressText(p?: ReadProgress): string {
  if (!p) return "Waiting…";
  const page = p.pages > 1 ? ` Page ${p.page} of ${p.pages}.` : "";
  const pct =
    p.stage === "reading" || p.stage === "rereading" ? ` ${Math.round(p.progress * 100)}%` : "";
  return `${STAGE_TEXT[p.stage]}${page}${pct}`;
}

/** The values for the review form from what was read. */
function toEntry(ex: Extraction | undefined): EntryData {
  const out: EntryData = {};
  if (!ex) return out;
  for (const [k, r] of Object.entries(ex.fields)) out[k] = r.value;
  return out;
}

/** Values and tables in the shape the import action takes. */
function toPayload(fields: FieldDef[], ex: Extraction) {
  const values: Record<string, string | string[]> = {};
  const tables: Record<string, Record<string, string>[]> = {};
  for (const f of fields) {
    const v = ex.fields[f.key]?.value ?? null;
    if (f.kind === "table") tables[f.key] = Array.isArray(v) ? (v as Record<string, string>[]) : [];
    else if (f.kind === "multiselect") values[f.key] = Array.isArray(v) ? (v as string[]) : [];
    else values[f.key] = typeof v === "string" ? v : "";
  }
  return { values, tables };
}

function fromForm(fields: FieldDef[], form: FormData) {
  const values: Record<string, string | string[]> = {};
  const tables: Record<string, Record<string, string>[]> = {};
  for (const f of fields) {
    if (f.kind === "table") {
      try {
        const rows: unknown = JSON.parse(String(form.get(tableName(f.key)) ?? "[]"));
        tables[f.key] = Array.isArray(rows) ? (rows as Record<string, string>[]) : [];
      } catch {
        tables[f.key] = [];
      }
    } else if (f.kind === "multiselect") {
      values[f.key] = form.getAll(inputName(f.key)).map(String);
    } else {
      values[f.key] = String(form.get(inputName(f.key)) ?? "");
    }
  }
  return { values, tables };
}

function StatusMark({ r }: { r?: FieldResult }) {
  if (!r || r.status === "found") return null;
  if (r.status === "missing") return <Badge variant="muted">Not found</Badge>;
  return (
    <Badge variant="warning" title={r.note}>
      Check
    </Badge>
  );
}

export function ImportFlow({
  types,
  storageReady,
  certificatesBase = "/admin/certificates",
}: {
  types: ImportType[];
  storageReady: boolean;
  /** Where certificate pages live for this person: the admin's or the uploader's */
  certificatesBase?: string;
}) {
  const inputId = useId();
  const autoId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [auto, setAuto] = useState(true);
  const queue = useRef<Item[]>([]);
  const running = useRef(false);
  // Read by the queue while it runs, so a change applies to the files still waiting
  const autoRef = useRef(true);
  const dupPolicy = useRef<DupPolicy>("ask");
  const [policy, setPolicy] = useState<DupPolicy>("ask");

  // Free the reader's memory when leaving the page
  useEffect(() => () => void stopReader(), []);

  const update = (key: string, change: Partial<Item>) =>
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));
  const typeOf = (id: string | null) => types.find((t) => t.id === id) ?? null;

  async function save(item: Item, type: ImportType, payload: Payload, opts: SaveOpts) {
    const ex = item.extraction;
    const read = item.reading?.read;
    update(item.key, { state: "saving", upload: 0, error: undefined, fieldErrors: undefined });
    const res = await importCertificateAction({
      typeId: type.id,
      ...payload,
      ocrText: item.reading?.text ?? "",
      meta: {
        auto: opts.auto,
        fileName: item.file.name.slice(0, 255),
        confidence: read?.confidence ?? 0,
        rotations: read?.rotations ?? [],
        ms: read?.ms ?? 0,
        found: ex?.found ?? 0,
        check: ex?.check ?? 0,
        missing: ex?.missing ?? 0,
        typeScore: item.reading?.detection.ranking.find((r) => r.typeId === type.id)?.score ?? 0,
        reread: !!item.reread,
      },
      toCheck: opts.toCheck,
      replace: opts.replace ?? null,
    });
    if (!res.ok) {
      if ("duplicate" in res) {
        // Chosen already for this batch: do the same without asking again
        if (dupPolicy.current === "skip") {
          return update(item.key, {
            state: "skipped",
            duplicate: res.duplicate,
            reading: undefined,
          });
        }
        if (dupPolicy.current === "replace" && opts.replace !== res.duplicate.id) {
          return save(item, type, payload, { ...opts, replace: res.duplicate.id });
        }
        return update(item.key, {
          state: "duplicate",
          duplicate: res.duplicate,
          pending: { payload, opts },
        });
      }
      return update(item.key, {
        state: "review",
        error: res.error,
        fieldErrors: res.fields,
        formKey: item.formKey + 1,
      });
    }
    const up = await uploadToCertificate(res.id, item.file, (p) => update(item.key, { upload: p }));
    if (!up.ok) {
      await discardImportAction(res.id);
      return update(item.key, { state: "error", error: up.error });
    }
    update(item.key, {
      state: "saved",
      saved: {
        id: res.id,
        title: res.title,
        auto: opts.auto,
        toCheck: opts.toCheck.length,
        replaced: res.replaced,
      },
      pending: undefined,
      // The page images are no longer needed; let the browser free them
      reading: undefined,
    });
  }

  async function process(item: Item) {
    const problem = fileProblem(item.file);
    if (problem) return update(item.key, { state: "error", error: problem });
    update(item.key, { state: "reading" });
    try {
      const onProgress = (p: ReadProgress) => update(item.key, { progress: p });
      const reading = await readCertificate(item.file, types, onProgress);
      const type = typeOf(reading.detection.typeId);
      if (!type) {
        return update(item.key, {
          state: "review",
          reading,
          typeId: null,
          error: "The type couldn't be recognised. Please choose it below.",
        });
      }
      const { extraction, reread } = await fillFields(reading, type.fields, onProgress);
      const next = { ...item, reading, typeId: type.id, extraction, reread };
      if (
        autoRef.current &&
        storageReady &&
        reading.detection.confident &&
        readyToSave(extraction, type.fields)
      ) {
        update(item.key, { reading, typeId: type.id, extraction, reread });
        const toCheck = type.fields
          .filter((f) => extraction.fields[f.key]?.status === "check")
          .map((f) => f.key);
        return save(next, type, toPayload(type.fields, extraction), { auto: true, toCheck });
      }
      update(item.key, {
        state: "review",
        reading,
        typeId: type.id,
        extraction,
        reread,
        formKey: item.formKey + 1,
      });
    } catch (e) {
      console.error(e);
      update(item.key, {
        state: "error",
        error: "This file couldn't be read. Try a clearer scan, or add it by hand.",
      });
    }
  }

  async function run() {
    if (running.current) return;
    running.current = true;
    try {
      // One file at a time: reading is heavy work for a phone
      for (let next = queue.current.shift(); next; next = queue.current.shift())
        await process(next);
    } finally {
      running.current = false;
    }
  }

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).map((file, n): Item => ({
      key: `${Date.now()}-${n}-${file.name}`,
      file,
      state: "waiting",
      typeId: null,
      formKey: 0,
    }));
    setItems((all) => [...picked, ...all].slice(0, 200));
    queue.current.push(...picked);
    if (input.current) input.current.value = "";
    void run();
  }

  async function changeType(item: Item, typeId: string) {
    const type = typeOf(typeId);
    if (!type || !item.reading) return update(item.key, { typeId });
    update(item.key, { typeId, state: "reading", error: undefined });
    const { extraction, reread } = await fillFields(item.reading, type.fields, (p) =>
      update(item.key, { progress: p }),
    );
    update(item.key, { state: "review", extraction, reread, formKey: item.formKey + 1 });
  }

  const remove = (key: string) => {
    queue.current = queue.current.filter((i) => i.key !== key);
    setItems((all) => all.filter((i) => i.key !== key));
  };

  const busy = items.some(
    (i) => i.state === "reading" || i.state === "saving" || i.state === "waiting",
  );
  const counts = {
    saved: items.filter((i) => i.state === "saved").length,
    review: items.filter((i) => i.state === "review" || i.state === "duplicate").length,
    skipped: items.filter((i) => i.state === "skipped").length,
  };
  const waitingDuplicates = items.filter((i) => i.state === "duplicate").length;

  return (
    <div className="grid gap-5">
      {!storageReady ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          File storage isn&apos;t set up yet, so files can be read but not saved. Add{" "}
          <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>, then redeploy.
        </p>
      ) : null}

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => onPick(e.target.files)}
        />
        <Button asChild size="lg" className="w-full sm:w-auto sm:justify-self-start">
          <label htmlFor={inputId} className="cursor-pointer">
            <ScanText /> Choose PDFs or scans
          </label>
        </Button>
        {STORE_AS_PDF ? (
          <p className="text-sm text-muted-foreground">
            Scans and photos are turned into a PDF before they are stored, and every file is named
            Report number_Date_Lab, for example B77215_2026-09-17_Bellerophon.pdf.
          </p>
        ) : null}
        <label htmlFor={autoId} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            id={autoId}
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              autoRef.current = e.target.checked;
              setAuto(e.target.checked);
            }}
            className="mt-0.5 size-6 shrink-0 cursor-pointer accent-primary"
          />
          <span>
            <span className="block font-medium">Save automatically</span>
            <span className="block text-muted-foreground">
              When the type is clear and every required field was read. Anything unclear is marked
              &ldquo;Check&rdquo; so you can look at it later.
            </span>
          </span>
        </label>
        <p className="text-sm text-muted-foreground">
          Files are read on this device and are never sent anywhere to be read. Each one is then
          checked and kept privately with its certificate.
        </p>
      </div>

      {items.length > 0 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {counts.saved} saved{counts.review ? `, ${counts.review} to look at` : ""}
          {counts.skipped ? `, ${counts.skipped} skipped (already stored)` : ""}
          {busy ? ". Working…" : "."}
        </p>
      ) : null}

      <ul className="grid gap-4">
        {items.map((item) => (
          <li key={item.key}>
            <ItemCard
              base={certificatesBase}
              item={item}
              storageReady={storageReady}
              onType={(id) => void changeType(item, id)}
              onRemove={() => remove(item.key)}
              onRetry={() => {
                update(item.key, { state: "waiting", error: undefined, progress: undefined });
                queue.current.push({ ...item, state: "waiting" });
                void run();
              }}
              onSave={(form) => {
                const type = typeOf(item.typeId);
                if (!type) return;
                void save(item, type, fromForm(type.fields, form), { auto: false, toCheck: [] });
              }}
              types={types}
              otherDuplicates={waitingDuplicates - (item.state === "duplicate" ? 1 : 0)}
              policy={policy}
              onDuplicate={(choice, forAll) => {
                if (forAll) {
                  dupPolicy.current = choice;
                  setPolicy(choice);
                }
                const targets = forAll ? items.filter((i) => i.state === "duplicate") : [item];
                for (const t of targets) {
                  const type = typeOf(t.typeId);
                  if (choice === "skip" || !type || !t.pending || !t.duplicate) {
                    update(t.key, { state: "skipped", pending: undefined, reading: undefined });
                    continue;
                  }
                  void save(t, type, t.pending.payload, {
                    ...t.pending.opts,
                    replace: t.duplicate.id,
                  });
                }
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemCard({
  base,
  item,
  types,
  storageReady,
  onType,
  onRemove,
  onRetry,
  onSave,
  onDuplicate,
  otherDuplicates,
  policy,
}: {
  base: string;
  item: Item;
  types: ImportType[];
  storageReady: boolean;
  onType: (id: string) => void;
  onRemove: () => void;
  onRetry: () => void;
  onSave: (form: FormData) => void;
  onDuplicate: (choice: "replace" | "skip", forAll: boolean) => void;
  otherDuplicates: number;
  policy: DupPolicy;
}) {
  const forAllId = useId();
  const [forAll, setForAll] = useState(false);
  const typeSelectId = useId();
  const type = types.find((t) => t.id === item.typeId) ?? null;
  const ex = item.extraction;
  const detection = item.reading?.detection;
  const marks: Record<string, ReactNode> = {};
  if (ex) for (const [k, r] of Object.entries(ex.fields)) marks[k] = <StatusMark r={r} />;

  return (
    <article
      className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5"
      aria-label={item.file.name}
    >
      <header className="flex min-w-0 items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium wrap-anywhere">{item.file.name}</p>
          <p className="text-sm text-muted-foreground">{formatBytes(item.file.size)}</p>
        </div>
        {item.state === "saved" ? (
          <Badge variant="success">
            <CircleCheck className="size-3.5" aria-hidden="true" /> Saved
          </Badge>
        ) : item.state === "review" ? (
          <Badge variant="warning">Look at this</Badge>
        ) : item.state === "duplicate" ? (
          <Badge variant="warning">Already stored</Badge>
        ) : item.state === "skipped" ? (
          <Badge variant="muted">Skipped</Badge>
        ) : item.state === "error" ? (
          <Badge variant="danger">
            <CircleAlert className="size-3.5" aria-hidden="true" /> Not saved
          </Badge>
        ) : null}
      </header>

      {item.state === "waiting" || item.state === "reading" || item.state === "saving" ? (
        <div className="grid gap-2" role="status">
          <p className="flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            {item.state === "saving"
              ? item.upload !== undefined && item.upload > 0
                ? `Saving and sending the file… ${Math.round(item.upload * 100)}%`
                : "Saving…"
              : progressText(item.progress)}
          </p>
          {item.state === "reading" && item.progress ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full bg-primary transition-[width]"
                style={{
                  width: `${Math.round(
                    ((["starting", "opening", "turning", "reading", "rereading"].indexOf(
                      item.progress.stage,
                    ) +
                      item.progress.progress) /
                      5) *
                      100,
                  )}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {item.state === "saved" && item.saved ? (
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium break-words">{item.saved.title}</span>
            <span className="block text-muted-foreground">
              {item.saved.replaced
                ? "Replaced the stored one (kept as an earlier version)"
                : item.saved.auto
                  ? "Saved automatically"
                  : "Saved"}
              {item.saved.toCheck
                ? `, ${item.saved.toCheck} field${item.saved.toCheck === 1 ? "" : "s"} marked to check.`
                : "."}
            </span>
          </p>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={`${base}/${item.saved.id}`}>Open</Link>
          </Button>
        </div>
      ) : null}

      {item.state === "error" ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium text-destructive">{item.error}</p>
          <div className="grid gap-2 sm:flex">
            <Button variant="outline" onClick={onRetry} className="w-full sm:w-auto">
              <RotateCcw /> Try again
            </Button>
            <Button variant="ghost" onClick={onRemove} className="w-full sm:w-auto">
              <X /> Remove
            </Button>
          </div>
        </div>
      ) : null}

      {item.state === "duplicate" && item.duplicate && item.pending ? (
        <DuplicateChoice
          base={base}
          stored={item.duplicate}
          incoming={coreOf(
            types.find((t) => t.id === item.typeId)?.fields ?? [],
            item.pending.payload,
          )}
          fileName={item.file.name}
          storageReady={storageReady}
          otherDuplicates={otherDuplicates}
          forAllId={forAllId}
          forAll={forAll}
          setForAll={setForAll}
          onChoose={(choice) => onDuplicate(choice, forAll && otherDuplicates > 0)}
        />
      ) : null}

      {item.state === "skipped" && item.duplicate ? (
        <p className="text-sm text-muted-foreground">
          Not saved: report {item.duplicate.reportNo} is already stored as{" "}
          <Link className="font-medium underline" href={`${base}/${item.duplicate.id}`}>
            {item.duplicate.title}
          </Link>
          {policy === "skip" ? " (skipping all duplicates in this batch)." : "."}
        </p>
      ) : null}

      {item.state === "review" ? (
        <div className="grid gap-4">
          {item.error ? <p className="text-sm font-medium text-destructive">{item.error}</p> : null}
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor={typeSelectId}>Certificate type</Label>
            <Select
              id={typeSelectId}
              value={item.typeId ?? ""}
              onChange={(e) => e.target.value && onType(e.target.value)}
            >
              <option value="">Choose a type</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            {detection && type ? (
              <p className="text-sm text-muted-foreground">
                {detection.typeId === type.id
                  ? detection.confident
                    ? "Recognised from the file."
                    : "Best guess from the file. Please make sure it's right."
                  : "Chosen by you."}
              </p>
            ) : null}
          </div>

          {type && ex ? (
            <>
              <p className="text-sm">
                <span className="font-medium text-success">{ex.found} read</span>
                {ex.check ? <span>, {ex.check} to check</span> : null}
                {ex.missing ? <span>, {ex.missing} not found</span> : null}. Please look over the
                values, then save.
              </p>
              <form
                key={item.formKey}
                noValidate
                className="grid gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSave(new FormData(e.currentTarget));
                }}
              >
                <CertificateFields
                  fields={type.fields}
                  values={toEntry(ex)}
                  errors={item.fieldErrors}
                  idPrefix={`imp-${item.key.replace(/[^a-zA-Z0-9-]/g, "")}-`}
                  marks={marks}
                />
                <div className="grid gap-2 sm:flex">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={!storageReady}
                  >
                    Save certificate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    onClick={onRemove}
                    className="w-full sm:w-auto"
                  >
                    <X /> Skip
                  </Button>
                </div>
              </form>
            </>
          ) : null}

          {item.reading?.text ? (
            <details className="rounded-lg border px-3 py-2 text-sm">
              <summary className="min-h-11 cursor-pointer content-center font-medium">
                Text that was read
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto text-xs break-words whitespace-pre-wrap">
                {item.reading.text}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

type Core = {
  reportNo: string;
  reportDate: string;
  identification: string;
  weight: string;
};

/** The values the comparison shows, read from what is about to be saved. */
function coreOf(fields: FieldDef[], payload: Payload): Core {
  const pick = (role: string) => {
    const f = fields.find((x) => x.role === role);
    const v = f ? payload.values[f.key] : undefined;
    return Array.isArray(v) ? v.join(", ") : (v ?? "");
  };
  return {
    reportNo: pick("report_no"),
    reportDate: pick("report_date"),
    identification: pick("identification"),
    weight: pick("weight"),
  };
}

/** Side by side: what is stored, what was just read. Then Replace or Skip. */
function DuplicateChoice({
  base,
  stored,
  incoming,
  fileName,
  storageReady,
  otherDuplicates,
  forAllId,
  forAll,
  setForAll,
  onChoose,
}: {
  base: string;
  stored: DuplicateInfo;
  incoming: Core;
  fileName: string;
  storageReady: boolean;
  otherDuplicates: number;
  forAllId: string;
  forAll: boolean;
  setForAll: (v: boolean) => void;
  onChoose: (choice: "replace" | "skip") => void;
}) {
  const rows: [string, string, string][] = [
    ["Report number", stored.reportNo, incoming.reportNo],
    ["Date", stored.reportDate ?? "", incoming.reportDate],
    ["Identification", stored.identification ?? "", incoming.identification],
    ["Weight (ct)", stored.weight ?? "", incoming.weight],
  ];
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Report {stored.reportNo} is already stored. A certificate can be stored only once, so choose
        to <strong>replace</strong> the stored one with this file, or <strong>skip</strong> this
        file.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="grid content-start gap-2 rounded-lg border p-3" aria-label="Stored now">
          <h3 className="text-sm font-semibold">Stored now</h3>
          <p className="text-xs text-muted-foreground">
            {stored.typeName} · added {formatDateTime(new Date(stored.createdAt))}
          </p>
          <dl className="grid gap-1 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/${stored.id}`} target="_blank">
                Open
              </Link>
            </Button>
            {stored.fileId ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/files/${stored.fileId}`} target="_blank" rel="noopener noreferrer">
                  View file
                </a>
              </Button>
            ) : null}
          </div>
        </section>
        <section
          className="grid content-start gap-2 rounded-lg border border-primary/40 p-3"
          aria-label="This file"
        >
          <h3 className="text-sm font-semibold">This file</h3>
          <p className="text-xs wrap-anywhere text-muted-foreground">{fileName}</p>
          <dl className="grid gap-1 text-sm">
            {rows.map(([label, before, value]) => (
              <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd
                  className={
                    value && value.toLowerCase() !== before.toLowerCase()
                      ? "min-w-0 font-medium break-words text-primary"
                      : "min-w-0 break-words"
                  }
                >
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      {otherDuplicates > 0 ? (
        <label
          htmlFor={forAllId}
          className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
        >
          <input
            id={forAllId}
            type="checkbox"
            checked={forAll}
            onChange={(e) => setForAll(e.target.checked)}
            className="size-6 shrink-0 cursor-pointer accent-primary"
          />
          Do the same for the other {otherDuplicates} duplicate{otherDuplicates === 1 ? "" : "s"}{" "}
          and any more in this batch
        </label>
      ) : null}
      <div className="grid gap-2 sm:flex">
        <Button
          onClick={() => onChoose("replace")}
          disabled={!storageReady}
          className="w-full sm:w-auto"
        >
          <RotateCcw /> Replace stored one
        </Button>
        <Button variant="outline" onClick={() => onChoose("skip")} className="w-full sm:w-auto">
          <X /> Skip this file
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Replace keeps the stored one as an earlier version, which can be restored from the
        certificate&apos;s page.
      </p>
    </div>
  );
}
