import { z } from "zod";

// Shared by the admin forms (browser) and the server actions, so both check the same rules.

export const FIELD_KINDS = [
  "text",
  "longtext",
  "number",
  "carat",
  "date",
  "select",
  "multiselect",
  "table",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const KIND_LABELS: Record<FieldKind, string> = {
  text: "Text",
  longtext: "Long text",
  number: "Number",
  carat: "Carat weight",
  date: "Date",
  select: "Choose one",
  multiselect: "Choose several",
  table: "Table (rows)",
};

/** Table columns can only be simple values */
export const COLUMN_KINDS = ["text", "number", "carat", "date"] as const;

/** One field of each type can be mapped to a "core role" so search and sort work across all types. */
export const ROLES = ["report_no", "report_date", "customer", "identification", "weight"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  report_no: "Report number",
  report_date: "Report date",
  customer: "Customer",
  identification: "Stone / identification",
  weight: "Total weight",
};

const ROLE_KINDS: Record<Role, FieldKind[]> = {
  report_no: ["text"],
  report_date: ["date"],
  customer: ["text"],
  identification: ["text"],
  weight: ["carat", "number"],
};

export const PATTERN_PRESETS = ["report_number", "date", "carat", "mm_size", "integer"] as const;

const keySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lower-case letters, numbers and _ (start with a letter).");

const hintsSchema = z.object({
  labels: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  pattern: z.string().trim().max(200).optional(),
  cleanup: z
    .array(z.enum(["trim", "uppercase", "parse_date", "parse_number"]))
    .max(4)
    .optional(),
});

const columnSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1, "Give every column a name.").max(80),
  kind: z.enum(COLUMN_KINDS),
});

export const fieldSchema = z
  .object({
    key: keySchema,
    label: z.string().trim().min(1, "Give every field a name.").max(80),
    kind: z.enum(FIELD_KINDS),
    required: z.boolean().default(false),
    showInList: z.boolean().default(false),
    filterable: z.boolean().default(false),
    role: z.enum(ROLES).optional(),
    options: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    columns: z.array(columnSchema).max(12).optional(),
    hints: hintsSchema.optional(),
  })
  .superRefine((f, ctx) => {
    if ((f.kind === "select" || f.kind === "multiselect") && !f.options?.length) {
      ctx.addIssue({ code: "custom", message: `"${f.label}" needs at least one choice.` });
    }
    if (f.kind === "table" && !f.columns?.length) {
      ctx.addIssue({ code: "custom", message: `"${f.label}" needs at least one column.` });
    }
    if (f.role && !ROLE_KINDS[f.role].includes(f.kind)) {
      ctx.addIssue({
        code: "custom",
        message: `"${f.label}" can't be the ${ROLE_LABELS[f.role].toLowerCase()} (wrong kind of field).`,
      });
    }
  });
export type FieldDef = z.infer<typeof fieldSchema>;

export const typeInputSchema = z
  .object({
    name: z.string().trim().min(2, "Give the type a name.").max(80),
    lab: z.string().trim().max(80).default(""),
    description: z.string().trim().max(300).default(""),
    icon: z.string().trim().min(1).max(40).default("file-text"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
    expiryTracking: z.boolean().default(false),
    expiryWarningDays: z.number().int().min(1).max(365).default(30),
    fingerprints: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
    summaryTemplate: z.string().trim().max(400).default(""),
    fields: z.array(fieldSchema).min(1, "Add at least one field.").max(60),
  })
  .superRefine((t, ctx) => {
    const keys = new Set<string>();
    const roles = new Set<string>();
    for (const f of t.fields) {
      if (keys.has(f.key))
        ctx.addIssue({ code: "custom", message: `Two fields share the key "${f.key}".` });
      keys.add(f.key);
      if (f.role) {
        if (roles.has(f.role)) {
          ctx.addIssue({
            code: "custom",
            message: `Only one field can be the ${ROLE_LABELS[f.role].toLowerCase()}.`,
          });
        }
        roles.add(f.role);
      }
    }
  });
export type TypeInput = z.infer<typeof typeInputSchema>;

export const ICONS = [
  "file-text",
  "gem",
  "award",
  "shield-check",
  "table",
  "stamp",
  "scroll",
] as const;

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "type"
  );
}

/** A field key made from its label, e.g. "Report No" becomes "report_no". */
export function keyFromLabel(label: string): string {
  const k = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(k) ? k : `f_${k || "field"}`.slice(0, 40);
}
