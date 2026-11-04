"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { SampleTester } from "@/components/admin/sample-tester";
import { TypeIcon } from "@/components/admin/type-icon";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveTypeAction } from "@/lib/admin/type-actions";
import {
  COLUMN_KINDS,
  FIELD_KINDS,
  ICONS,
  KIND_LABELS,
  PATTERN_PRESETS,
  ROLES,
  ROLE_LABELS,
  keyFromLabel,
  typeInputSchema,
  type FieldDef,
  type FieldKind,
  type Role,
  type TypeInput,
} from "@/lib/types/schema";
import { cn } from "@/lib/utils";

type DraftColumn = {
  uid: string;
  key: string;
  label: string;
  kind: (typeof COLUMN_KINDS)[number];
  /** Header words to look for when reading the table from a scan */
  labels?: string[];
};
type DraftField = {
  uid: string;
  /** Existing fields keep their key for ever, because saved certificates are stored under it */
  lockedKey: string | null;
  label: string;
  kind: FieldKind;
  required: boolean;
  showInList: boolean;
  filterable: boolean;
  role: Role | "";
  optionsText: string;
  columns: DraftColumn[];
  labelsText: string;
  pattern: string;
  customPattern: string;
  cleanup: string[];
};

const STEPS = ["Basics", "Fields", "Extraction hints", "Review"] as const;
const CLEANUPS = [
  ["trim", "Trim spaces"],
  ["uppercase", "UPPERCASE"],
  ["parse_date", "Read as a date"],
  ["parse_number", "Read as a number"],
] as const;
const PRESET_LABELS: Record<(typeof PATTERN_PRESETS)[number], string> = {
  report_number: "Report number",
  date: "Date",
  carat: "Carat weight",
  mm_size: "Size in mm",
  integer: "Whole number",
};
const COLORS = ["#3a75b1", "#2d8a5f", "#7a5bb5", "#c27a1a", "#1f8aa3", "#c62828"];

let counter = 0;
const uid = () => `u${++counter}`;
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function fromField(f: FieldDef): DraftField {
  const pattern = f.hints?.pattern ?? "";
  const preset = (PATTERN_PRESETS as readonly string[]).includes(pattern);
  return {
    uid: uid(),
    lockedKey: f.key,
    label: f.label,
    kind: f.kind,
    required: f.required,
    showInList: f.showInList,
    filterable: f.filterable,
    role: f.role ?? "",
    optionsText: (f.options ?? []).join("\n"),
    columns: (f.columns ?? []).map((c) => ({ uid: uid(), ...c })),
    labelsText: (f.hints?.labels ?? []).join("\n"),
    pattern: pattern.startsWith("re:") ? "custom" : preset ? pattern : "",
    customPattern: pattern.startsWith("re:") ? pattern.slice(3) : "",
    cleanup: f.hints?.cleanup ?? [],
  };
}

function newField(): DraftField {
  return {
    uid: uid(),
    lockedKey: null,
    label: "",
    kind: "text",
    required: false,
    showInList: false,
    filterable: false,
    role: "",
    optionsText: "",
    columns: [],
    labelsText: "",
    pattern: "",
    customPattern: "",
    cleanup: [],
  };
}

type Initial = TypeInput | null;

/** Turns the form state into the JSON the server checks and saves. */
function toConfig(d: {
  name: string;
  lab: string;
  description: string;
  icon: string;
  color: string;
  expiryTracking: boolean;
  expiryWarningDays: string;
  fingerprintsText: string;
  summaryTemplate: string;
  fields: DraftField[];
}) {
  const used = new Set<string>(d.fields.flatMap((f) => (f.lockedKey ? [f.lockedKey] : [])));
  const fields = d.fields.map((f) => {
    let key = f.lockedKey;
    if (!key) {
      const base = keyFromLabel(f.label);
      key = base;
      for (let n = 2; used.has(key); n++) key = `${base}_${n}`.slice(0, 40);
      used.add(key);
    }
    const labels = lines(f.labelsText);
    const pattern =
      f.pattern === "custom"
        ? f.customPattern.trim()
          ? `re:${f.customPattern.trim()}`
          : ""
        : f.pattern;
    const colUsed = new Set<string>();
    return {
      key,
      label: f.label,
      kind: f.kind,
      required: f.required,
      showInList: f.showInList,
      filterable: f.filterable,
      ...(f.role ? { role: f.role } : {}),
      ...(f.kind === "select" || f.kind === "multiselect" ? { options: lines(f.optionsText) } : {}),
      ...(f.kind === "table"
        ? {
            columns: f.columns.map((c) => {
              let ck = c.key || keyFromLabel(c.label);
              const base = ck;
              for (let n = 2; colUsed.has(ck); n++) ck = `${base}_${n}`.slice(0, 40);
              colUsed.add(ck);
              const labels = (c.labels ?? []).map((l) => l.trim()).filter(Boolean);
              return {
                key: ck,
                label: c.label,
                kind: c.kind,
                ...(labels.length ? { labels } : {}),
              };
            }),
          }
        : {}),
      hints: {
        labels,
        ...(pattern ? { pattern } : {}),
        ...(f.cleanup.length ? { cleanup: f.cleanup } : {}),
      },
    };
  });
  return {
    name: d.name,
    lab: d.lab,
    description: d.description,
    icon: d.icon,
    color: d.color,
    expiryTracking: d.expiryTracking,
    expiryWarningDays: Number(d.expiryWarningDays) || 30,
    fingerprints: lines(d.fingerprintsText),
    summaryTemplate: d.summaryTemplate,
    fields,
  };
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0 cursor-pointer accent-primary"
      />
      {label}
    </label>
  );
}

export function TypeWizard({
  typeId,
  initial,
  certificateCount,
}: {
  typeId: string | null;
  initial: Initial;
  certificateCount: number;
}) {
  const [state, action] = useActionState(saveTypeAction.bind(null, typeId), null);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [lab, setLab] = useState(initial?.lab ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "file-text");
  const [color, setColor] = useState(initial?.color ?? "#3a75b1");
  const [expiryTracking, setExpiryTracking] = useState(initial?.expiryTracking ?? false);
  const [expiryWarningDays, setExpiryWarningDays] = useState(
    String(initial?.expiryWarningDays ?? 30),
  );
  const [fingerprintsText, setFingerprintsText] = useState(
    (initial?.fingerprints ?? []).join("\n"),
  );
  const [summaryTemplate, setSummaryTemplate] = useState(initial?.summaryTemplate ?? "");
  const [fields, setFields] = useState<DraftField[]>(() =>
    initial ? initial.fields.map(fromField) : [newField()],
  );

  const config = useMemo(
    () =>
      toConfig({
        name,
        lab,
        description,
        icon,
        color,
        expiryTracking,
        expiryWarningDays,
        fingerprintsText,
        summaryTemplate,
        fields,
      }),
    [
      name,
      lab,
      description,
      icon,
      color,
      expiryTracking,
      expiryWarningDays,
      fingerprintsText,
      summaryTemplate,
      fields,
    ],
  );

  const patch = (id: string, change: Partial<DraftField>) =>
    setFields((all) => all.map((f) => (f.uid === id ? { ...f, ...change } : f)));
  const move = (index: number, by: number) =>
    setFields((all) => {
      const next = [...all];
      const target = index + by;
      if (target < 0 || target >= next.length) return all;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  function check(): string | null {
    const parsed = typeInputSchema.safeParse(config);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Please check the form.";
    return null;
  }

  function go(to: number) {
    if (to > step) {
      if (step === 0 && name.trim().length < 2) return setProblem("Give the type a name.");
      if (step >= 1) {
        const issue = check();
        if (issue) return setProblem(issue);
      }
    }
    setProblem(null);
    setStep(to);
    window.scrollTo({ top: 0 });
  }

  return (
    <form
      action={action}
      noValidate
      onSubmit={(e) => {
        if (step !== STEPS.length - 1) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      className="grid gap-6"
    >
      <input type="hidden" name="config" value={JSON.stringify(config)} />

      <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-center text-[11px] leading-tight font-medium sm:flex-row sm:gap-2 sm:text-sm",
                i === step
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-input text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full text-xs",
                  i <= step ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {i + 1}
              </span>
              <span className="max-w-full truncate">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <FormAlert state={state} />
      {problem ? <Alert variant="error">{problem}</Alert> : null}

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Basics</CardTitle>
            <CardDescription>Name the type and choose how it looks in lists.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field
              label="Type name"
              name="typeName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Issuer / laboratory"
                name="typeLab"
                value={lab}
                onChange={(e) => setLab(e.target.value)}
                hint="Staff can filter by this across all types, for example AIGS."
                autoComplete="off"
              />
              <Field
                label="Short description"
                name="typeDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Icon">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={icon === i}
                    aria-label={i}
                    onClick={() => setIcon(i)}
                    className={cn(
                      "flex size-12 items-center justify-center rounded-lg border",
                      icon === i ? "border-primary bg-accent" : "border-input",
                    )}
                  >
                    <TypeIcon name={i} color={color} />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Colour ${c}`}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-11 rounded-full border-2",
                      color === c ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Check
              label="Certificates of this type expire (track an expiry date)"
              checked={expiryTracking}
              onChange={setExpiryTracking}
            />
            {expiryTracking ? (
              <Field
                label="Warn this many days before expiry"
                name="warnDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={expiryWarningDays}
                onChange={(e) => setExpiryWarningDays(e.target.value)}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Fields</CardTitle>
            <CardDescription>
              The details to record for every certificate of this type. Use the arrows to reorder.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {fields.map((f, index) => (
              <div key={f.uid} className="grid gap-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={`Field ${index + 1} name`}
                    name={`label-${f.uid}`}
                    value={f.label}
                    onChange={(e) => patch(f.uid, { label: e.target.value })}
                    autoComplete="off"
                  />
                  <div className="grid gap-2">
                    <Label htmlFor={`kind-${f.uid}`}>Kind</Label>
                    <Select
                      id={`kind-${f.uid}`}
                      value={f.kind}
                      onChange={(e) => {
                        const kind = e.target.value as FieldKind;
                        patch(f.uid, {
                          kind,
                          columns:
                            kind === "table" && f.columns.length === 0
                              ? [{ uid: uid(), key: "", label: "", kind: "text" }]
                              : f.columns,
                          role: "",
                        });
                      }}
                      disabled={f.lockedKey !== null && certificateCount > 0 && initial !== null}
                    >
                      {FIELD_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {f.kind === "select" || f.kind === "multiselect" ? (
                  <div className="grid gap-2">
                    <Label htmlFor={`opts-${f.uid}`}>Choices (one per line)</Label>
                    <Textarea
                      id={`opts-${f.uid}`}
                      value={f.optionsText}
                      onChange={(e) => patch(f.uid, { optionsText: e.target.value })}
                    />
                  </div>
                ) : null}

                {f.kind === "table" ? (
                  <div className="grid gap-3">
                    <p className="text-sm font-medium">Columns of each row</p>
                    {f.columns.map((c, ci) => (
                      <div key={c.uid} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                        <Field
                          label={`Column ${ci + 1} name`}
                          name={`col-${c.uid}`}
                          value={c.label}
                          onChange={(e) =>
                            patch(f.uid, {
                              columns: f.columns.map((x) =>
                                x.uid === c.uid ? { ...x, label: e.target.value } : x,
                              ),
                            })
                          }
                          autoComplete="off"
                        />
                        <div className="grid gap-2">
                          <Label htmlFor={`ck-${c.uid}`}>Kind</Label>
                          <Select
                            id={`ck-${c.uid}`}
                            value={c.kind}
                            onChange={(e) =>
                              patch(f.uid, {
                                columns: f.columns.map((x) =>
                                  x.uid === c.uid
                                    ? { ...x, kind: e.target.value as DraftColumn["kind"] }
                                    : x,
                                ),
                              })
                            }
                          >
                            {COLUMN_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABELS[k]}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="self-end"
                          aria-label={`Remove column ${ci + 1}`}
                          onClick={() =>
                            patch(f.uid, { columns: f.columns.filter((x) => x.uid !== c.uid) })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      onClick={() =>
                        patch(f.uid, {
                          columns: [...f.columns, { uid: uid(), key: "", label: "", kind: "text" }],
                        })
                      }
                    >
                      <Plus /> Add column
                    </Button>
                  </div>
                ) : null}

                <div className="grid gap-x-6 sm:grid-cols-3">
                  <Check
                    label="Required"
                    checked={f.required}
                    onChange={(v) => patch(f.uid, { required: v })}
                  />
                  <Check
                    label="Show in lists"
                    checked={f.showInList}
                    onChange={(v) => patch(f.uid, { showInList: v })}
                  />
                  <Check
                    label="Staff can filter by it"
                    checked={f.filterable}
                    onChange={(v) => patch(f.uid, { filterable: v })}
                  />
                </div>

                {f.kind !== "table" &&
                f.kind !== "longtext" &&
                f.kind !== "select" &&
                f.kind !== "multiselect" ? (
                  <div className="grid gap-2 sm:max-w-sm">
                    <Label htmlFor={`role-${f.uid}`}>Counts as (for search and sorting)</Label>
                    <Select
                      id={`role-${f.uid}`}
                      value={f.role}
                      onChange={(e) => patch(f.uid, { role: e.target.value as Role | "" })}
                    >
                      <option value="">Nothing special</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp /> Up
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => move(index, 1)}
                    disabled={index === fields.length - 1}
                  >
                    <ArrowDown /> Down
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setFields((all) => all.filter((x) => x.uid !== f.uid))}
                    disabled={fields.length === 1}
                  >
                    <Trash2 /> Remove
                  </Button>
                </div>
                {f.lockedKey && initial && certificateCount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Removing a field only hides it. Values already saved are never deleted.
                  </p>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={() => setFields((all) => [...all, newField()])}
            >
              <Plus /> Add a field
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Extraction hints</CardTitle>
            <CardDescription>
              Optional. These help the app read a scanned certificate and fill the fields for you.
              You can skip this step, and test your hints with a sample at the bottom.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="fingerprints">Phrases that identify this type (one per line)</Label>
              <Textarea
                id="fingerprints"
                value={fingerprintsText}
                onChange={(e) => setFingerprintsText(e.target.value)}
                placeholder={"ANALYSIS SHORT REPORT"}
              />
              <p className="text-sm text-muted-foreground">
                Words printed on every certificate of this type, so the app can suggest the type
                after reading an upload.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template">Summary sentence</Label>
              <Textarea
                id="template"
                value={summaryTemplate}
                onChange={(e) => setSummaryTemplate(e.target.value)}
                placeholder="{identification}, {weight} ct. Report {report_no} dated {date}."
              />
              <p className="text-sm text-muted-foreground">
                Put a field&apos;s key in braces. A sentence is left out if one of its values is
                empty. Keys:{" "}
                {config.fields.map((f) => (
                  <code
                    key={f.key}
                    className="mr-1 inline-block max-w-full rounded bg-muted px-1 break-all"
                  >
                    {f.key}
                  </code>
                ))}
              </p>
            </div>
            <h3 className="text-base font-semibold">Per field</h3>
            {fields
              .filter((f) => f.kind !== "table")
              .map((f) => (
                <div key={f.uid} className="grid gap-3 rounded-lg border p-4">
                  <p className="font-medium">{f.label || "Unnamed field"}</p>
                  <div className="grid gap-2">
                    <Label htmlFor={`labels-${f.uid}`}>
                      Words printed next to the value (one per line)
                    </Label>
                    <Textarea
                      id={`labels-${f.uid}`}
                      className="min-h-16"
                      value={f.labelsText}
                      onChange={(e) => patch(f.uid, { labelsText: e.target.value })}
                      placeholder="Report No"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`pat-${f.uid}`}>Value looks like</Label>
                      <Select
                        id={`pat-${f.uid}`}
                        value={f.pattern}
                        onChange={(e) => patch(f.uid, { pattern: e.target.value })}
                      >
                        <option value="">Anything</option>
                        {PATTERN_PRESETS.map((p) => (
                          <option key={p} value={p}>
                            {PRESET_LABELS[p]}
                          </option>
                        ))}
                        <option value="custom">Custom pattern</option>
                      </Select>
                    </div>
                    {f.pattern === "custom" ? (
                      <Field
                        label="Custom pattern (regex)"
                        name={`re-${f.uid}`}
                        value={f.customPattern}
                        onChange={(e) => patch(f.uid, { customPattern: e.target.value })}
                        autoComplete="off"
                      />
                    ) : null}
                  </div>
                  <fieldset className="grid gap-x-6 sm:grid-cols-2">
                    <legend className="mb-1 text-sm font-medium">Clean up</legend>
                    {CLEANUPS.map(([value, label]) => (
                      <Check
                        key={value}
                        label={label}
                        checked={f.cleanup.includes(value)}
                        onChange={(on) =>
                          patch(f.uid, {
                            cleanup: on
                              ? [...f.cleanup, value]
                              : f.cleanup.filter((c) => c !== value),
                          })
                        }
                      />
                    ))}
                  </fieldset>
                </div>
              ))}
            {fields
              .filter((f) => f.kind === "table" && f.columns.length > 0)
              .map((f) => (
                <div key={f.uid} className="grid gap-3 rounded-lg border p-4">
                  <p className="font-medium">{f.label || "Unnamed table"}: column headers</p>
                  <p className="text-sm text-muted-foreground">
                    Words printed at the top of each column, separated by commas. The column name is
                    always tried too.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {f.columns.map((c) => (
                      <Field
                        key={c.uid}
                        label={c.label || "Unnamed column"}
                        name={`hdr-${c.uid}`}
                        value={(c.labels ?? []).join(", ")}
                        placeholder="Pc(s), Pieces"
                        onChange={(e) =>
                          patch(f.uid, {
                            columns: f.columns.map((x) =>
                              x.uid === c.uid
                                ? {
                                    ...x,
                                    labels: e.target.value.split(",").map((l) => l.trimStart()),
                                  }
                                : x,
                            ),
                          })
                        }
                        autoComplete="off"
                      />
                    ))}
                  </div>
                </div>
              ))}
            <SampleTester fields={config.fields as FieldDef[]} fingerprints={config.fingerprints} />
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>4. Review and save</CardTitle>
            <CardDescription>
              {typeId
                ? "Saving keeps the previous version, so older certificates stay readable."
                : "You can change everything later."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <TypeIcon name={icon} color={color} />
              <div className="min-w-0">
                <p className="font-medium break-words">{name || "Unnamed type"}</p>
                <p className="text-sm text-muted-foreground">{lab || "No issuer set"}</p>
              </div>
            </div>
            <ul className="grid gap-2">
              {config.fields.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{f.label || "Unnamed"}</span>
                  <Badge variant="muted">{KIND_LABELS[f.kind]}</Badge>
                  {f.required ? <Badge variant="warning">Required</Badge> : null}
                  {f.role ? <Badge>{ROLE_LABELS[f.role]}</Badge> : null}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Tip: go back to step 3 and use <strong>Test with a sample</strong> to see which fields
              the app can read before you save.
            </p>
            <SubmitButton
              size="lg"
              className="w-full sm:w-auto sm:justify-self-start"
              pendingText="Saving…"
            >
              {typeId ? "Save new version" : "Create type"}
            </SubmitButton>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => go(step - 1)} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => go(step + 1)}>
            Next
          </Button>
        ) : null}
      </div>
    </form>
  );
}
