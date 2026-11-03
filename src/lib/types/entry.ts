import type { FieldDef, Role } from "./schema";

// Reads and checks the values typed into a certificate form, using the type's field definitions.

export type EntryValue =
  string | number | string[] | Record<string, string | number | null>[] | null;
export type EntryData = Record<string, EntryValue>;

const isDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

function parseNumber(raw: string): number | null | "bad" {
  const t = raw.trim().replace(/,/g, ".");
  if (t === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return "bad";
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : "bad";
}

function simpleValue(kind: string, raw: string): string | number | null | "bad" {
  const t = raw.trim();
  if (t === "") return null;
  if (kind === "number" || kind === "carat") return parseNumber(t);
  if (kind === "date") return isDate(t) ? t : "bad";
  return t.slice(0, 2000);
}

export const inputName = (key: string) => `f_${key}`;
export const tableName = (key: string) => `t_${key}`;

export function parseEntry(
  fields: FieldDef[],
  get: (name: string) => string | null,
  getAll: (name: string) => string[],
): { data: EntryData; errors: Record<string, string> } {
  const data: EntryData = {};
  const errors: Record<string, string> = {};

  for (const f of fields) {
    if (f.kind === "multiselect") {
      const picked = getAll(inputName(f.key)).filter((v) => f.options?.includes(v));
      data[f.key] = picked.length ? picked : null;
    } else if (f.kind === "select") {
      const v = (get(inputName(f.key)) ?? "").trim();
      if (v && !f.options?.includes(v)) errors[f.key] = "Pick one of the choices.";
      data[f.key] = v || null;
    } else if (f.kind === "table") {
      let rows: unknown = [];
      try {
        rows = JSON.parse(get(tableName(f.key)) || "[]");
      } catch {
        errors[f.key] = "The table could not be read. Please try again.";
      }
      const out: Record<string, string | number | null>[] = [];
      if (Array.isArray(rows)) {
        for (const row of rows.slice(0, 200)) {
          const clean: Record<string, string | number | null> = {};
          let any = false;
          for (const c of f.columns ?? []) {
            const raw =
              row && typeof row === "object" ? (row as Record<string, unknown>)[c.key] : "";
            const v = simpleValue(
              c.kind,
              typeof raw === "string" || typeof raw === "number" ? String(raw) : "",
            );
            if (v === "bad") {
              errors[f.key] = `Check the "${c.label}" column: it has a value that isn't valid.`;
              clean[c.key] = null;
            } else {
              clean[c.key] = v;
              if (v !== null) any = true;
            }
          }
          if (any) out.push(clean);
        }
      }
      data[f.key] = out.length ? out : null;
    } else {
      const v = simpleValue(f.kind, get(inputName(f.key)) ?? "");
      if (v === "bad") {
        errors[f.key] =
          f.kind === "date" ? "Enter a valid date." : "Enter a number, for example 1.25.";
        data[f.key] = null;
      } else {
        data[f.key] = v;
      }
    }

    if (f.required && !errors[f.key] && (data[f.key] === null || data[f.key] === undefined)) {
      errors[f.key] = `${f.label} is required.`;
    }
  }
  return { data, errors };
}

const display = (v: EntryValue): string => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v))
    return v.every((x) => typeof x === "string") ? (v as string[]).join(", ") : "";
  return String(v);
};

/** Fills {field_key} in a template. A sentence with a missing value is dropped, so no blanks show. */
export function renderTemplate(template: string, data: EntryData): string {
  if (!template.trim()) return "";
  const sentences = template.split(/(?<=\.)\s+/);
  const out: string[] = [];
  for (const s of sentences) {
    let missing = false;
    const filled = s.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, key: string) => {
      const v = display(data[key] ?? null);
      if (!v) missing = true;
      return v;
    });
    if (!missing) out.push(filled.trim());
  }
  return out.join(" ");
}

export function keyPoints(fields: FieldDef[], data: EntryData): string[] {
  return fields
    .filter((f) => f.showInList && f.kind !== "table")
    .map((f) => ({ f, v: display(data[f.key] ?? null) }))
    .filter(({ v }) => v)
    .map(({ f, v }) => `${f.label}: ${v}`);
}

/** The values that go in the searchable "core role" columns. */
export function coreColumns(fields: FieldDef[], data: EntryData) {
  const byRole = (role: Role) => {
    const f = fields.find((x) => x.role === role);
    return f ? (data[f.key] ?? null) : null;
  };
  const text = (v: EntryValue) => (typeof v === "string" ? v : v === null ? null : String(v));
  const num = (v: EntryValue) => (typeof v === "number" ? v : null);
  return {
    report_no: text(byRole("report_no")),
    report_date: text(byRole("report_date")),
    customer: text(byRole("customer")),
    identification: text(byRole("identification")),
    weight_ct: num(byRole("weight")),
  };
}

export function titleFor(typeName: string, core: ReturnType<typeof coreColumns>): string {
  const parts = [core.identification, core.report_no].filter(Boolean);
  return parts.length ? parts.join(" · ") : typeName;
}
