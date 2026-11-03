"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveCertificateAction } from "@/lib/admin/certificate-actions";
import { inputName, tableName, type EntryData } from "@/lib/types/entry";
import type { FieldDef } from "@/lib/types/schema";

type Row = Record<string, string>;

const text = (v: unknown): string =>
  v === null || v === undefined ? "" : Array.isArray(v) ? "" : String(v);

function TableEditor({
  field,
  initial,
  error,
}: {
  field: FieldDef;
  initial: unknown;
  error?: string;
}) {
  const columns = field.columns ?? [];
  const [rows, setRows] = useState<Row[]>(() =>
    Array.isArray(initial)
      ? (initial as Record<string, unknown>[]).map((r) =>
          Object.fromEntries(columns.map((c) => [c.key, text(r[c.key])])),
        )
      : [],
  );
  const blank = () => Object.fromEntries(columns.map((c) => [c.key, ""])) as Row;
  const change = (i: number, key: string, value: string) =>
    setRows((all) => all.map((r, n) => (n === i ? { ...r, [key]: value } : r)));

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">
        {field.label}
        {field.required ? " *" : ""}
      </p>
      <input type="hidden" name={tableName(field.key)} value={JSON.stringify(rows)} />
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          No rows yet.
        </p>
      ) : null}
      {rows.map((row, i) => (
        <div key={i} className="grid gap-3 rounded-lg border p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((c) => (
              <Field
                key={c.key}
                label={c.label}
                name={`row-${field.key}-${i}-${c.key}`}
                type={c.kind === "date" ? "date" : "text"}
                inputMode={c.kind === "number" || c.kind === "carat" ? "decimal" : undefined}
                value={row[c.key] ?? ""}
                onChange={(e) => change(i, c.key, e.target.value)}
                autoComplete="off"
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setRows((all) => all.filter((_, n) => n !== i))}
          >
            <Trash2 /> Remove row {i + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => setRows((all) => [...all, blank()])}
      >
        <Plus /> Add row
      </Button>
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

/** The form for one certificate, built from the fields of its type. */
export function CertificateForm({
  typeId,
  certId,
  fields,
  values,
}: {
  typeId: string;
  certId: string | null;
  fields: FieldDef[];
  values: EntryData;
}) {
  const [state, action] = useActionState(saveCertificateAction.bind(null, typeId, certId), null);
  const err = state?.fields ?? {};
  const typed = state?.values;

  return (
    <form action={action} noValidate className="grid gap-5">
      <FormAlert state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        {fields.map((f) => {
          const name = inputName(f.key);
          const label = f.required ? `${f.label} *` : f.label;
          const v = values[f.key];

          if (f.kind === "table") {
            return (
              <div key={f.key} className="md:col-span-2">
                <TableEditor field={f} initial={v} error={err[f.key]} />
              </div>
            );
          }
          if (f.kind === "longtext") {
            return (
              <div key={f.key} className="grid gap-2 md:col-span-2">
                <Label htmlFor={name}>{label}</Label>
                <Textarea
                  id={name}
                  name={name}
                  defaultValue={typed?.[name] ?? text(v)}
                  aria-invalid={err[f.key] ? true : undefined}
                />
                {err[f.key] ? (
                  <p className="text-sm font-medium text-destructive">{err[f.key]}</p>
                ) : null}
              </div>
            );
          }
          if (f.kind === "select") {
            return (
              <div key={f.key} className="grid gap-2">
                <Label htmlFor={name}>{label}</Label>
                <Select
                  id={name}
                  name={name}
                  defaultValue={typed?.[name] ?? text(v)}
                  aria-invalid={err[f.key] ? true : undefined}
                >
                  <option value="">Not set</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
                {err[f.key] ? (
                  <p className="text-sm font-medium text-destructive">{err[f.key]}</p>
                ) : null}
              </div>
            );
          }
          if (f.kind === "multiselect") {
            const picked =
              typed?.[name] !== undefined
                ? typed[name].split("\n")
                : Array.isArray(v)
                  ? (v as string[])
                  : [];
            return (
              <fieldset key={f.key} className="grid gap-1 md:col-span-2">
                <legend className="mb-1 text-sm font-medium">{label}</legend>
                <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                  {f.options?.map((o) => (
                    <label
                      key={o}
                      className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        name={name}
                        value={o}
                        defaultChecked={picked.includes(o)}
                        className="size-6 shrink-0 cursor-pointer accent-primary"
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          return (
            <Field
              key={f.key}
              label={label}
              name={name}
              type={f.kind === "date" ? "date" : "text"}
              inputMode={f.kind === "number" || f.kind === "carat" ? "decimal" : undefined}
              defaultValue={typed?.[name] ?? text(v)}
              error={err[f.key]}
              autoComplete="off"
            />
          );
        })}
      </div>
      <SubmitButton
        size="lg"
        className="w-full sm:w-auto sm:justify-self-start"
        pendingText="Saving…"
      >
        {certId ? "Save changes" : "Add certificate"}
      </SubmitButton>
    </form>
  );
}
