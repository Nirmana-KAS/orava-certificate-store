import { describe, expect, it } from "vitest";

import { coreColumns, keyPoints, parseEntry, renderTemplate, titleFor } from "@/lib/types/entry";
import { keyFromLabel, slugify, typeInputSchema, type FieldDef } from "@/lib/types/schema";

const field = (over: Partial<FieldDef> & Pick<FieldDef, "key" | "label" | "kind">): FieldDef => ({
  required: false,
  showInList: false,
  filterable: false,
  ...over,
});

const fields: FieldDef[] = [
  field({
    key: "report_no",
    label: "Report No",
    kind: "text",
    role: "report_no",
    required: true,
    showInList: true,
  }),
  field({ key: "date", label: "Date", kind: "date", role: "report_date" }),
  field({ key: "weight", label: "Weight", kind: "carat", role: "weight", showInList: true }),
  field({
    key: "ident",
    label: "Identification",
    kind: "text",
    role: "identification",
    showInList: true,
  }),
  field({ key: "colour", label: "Colour", kind: "select", options: ["Red", "Blue"] }),
  field({ key: "tools", label: "Tools", kind: "multiselect", options: ["A", "B", "C"] }),
  field({
    key: "rows",
    label: "Rows",
    kind: "table",
    columns: [
      { key: "item", label: "Item", kind: "text" },
      { key: "carat", label: "Carat", kind: "carat" },
    ],
  }),
];

function read(values: Record<string, string | string[]>) {
  return parseEntry(
    fields,
    (n) => {
      const v = values[n];
      return typeof v === "string" ? v : null;
    },
    (n) => {
      const v = values[n];
      return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    },
  );
}

describe("reading a certificate form", () => {
  it("accepts good values and turns numbers and dates into the right kind", () => {
    const { data, errors } = read({
      f_report_no: " B77215 ",
      f_date: "2026-06-30",
      f_weight: "1,25",
      f_ident: "Natural Ruby",
      f_colour: "Red",
      f_tools: ["A", "C"],
      t_rows: JSON.stringify([
        { item: "1", carat: "0.5" },
        { item: "", carat: "" },
      ]),
    });
    expect(errors).toEqual({});
    expect(data.report_no).toBe("B77215");
    expect(data.weight).toBe(1.25);
    expect(data.date).toBe("2026-06-30");
    expect(data.tools).toEqual(["A", "C"]);
    expect(data.rows).toEqual([{ item: "1", carat: 0.5 }]);
  });

  it("flags required, bad dates, bad numbers and unknown choices", () => {
    const { errors } = read({
      f_date: "2026-02-31",
      f_weight: "heavy",
      f_colour: "Green",
      t_rows: JSON.stringify([{ item: "x", carat: "abc" }]),
    });
    expect(errors.report_no).toBe("Report No is required.");
    expect(errors.date).toBe("Enter a valid date.");
    expect(errors.weight).toContain("number");
    expect(errors.colour).toBeDefined();
    expect(errors.rows).toContain("Carat");
  });

  it("ignores multi-select values that are not offered", () => {
    expect(read({ f_report_no: "x", f_tools: ["A", "Z"] }).data.tools).toEqual(["A"]);
  });

  it("survives a broken table payload", () => {
    expect(read({ f_report_no: "x", t_rows: "{not json" }).errors.rows).toBeDefined();
  });
});

describe("summary and search columns", () => {
  const { data } = read({
    f_report_no: "B1",
    f_weight: "2",
    f_ident: "Ruby",
    f_date: "2026-01-05",
  });

  it("fills the template and drops a sentence with a missing value", () => {
    expect(renderTemplate("{ident}, {weight} ct. Origin {origin}. Report {report_no}.", data)).toBe(
      "Ruby, 2 ct. Report B1.",
    );
    expect(renderTemplate("", data)).toBe("");
  });

  it("lists the key points and the core columns", () => {
    expect(keyPoints(fields, data)).toEqual(["Report No: B1", "Weight: 2", "Identification: Ruby"]);
    const core = coreColumns(fields, data);
    expect(core).toMatchObject({ report_no: "B1", report_date: "2026-01-05", weight_ct: 2 });
    expect(titleFor("Type", core)).toBe("Ruby · B1");
    expect(titleFor("Type", coreColumns(fields, {}))).toBe("Type");
  });
});

describe("type definitions", () => {
  const base = {
    name: "Test",
    color: "#3a75b1",
    fields: [{ key: "a", label: "A", kind: "text" }],
  };

  it("accepts a simple type", () => {
    expect(typeInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects duplicate keys, duplicate roles and a role on the wrong kind", () => {
    const dup = { ...base, fields: [base.fields[0], base.fields[0]] };
    expect(typeInputSchema.safeParse(dup).success).toBe(false);
    const roles = {
      ...base,
      fields: [
        { key: "a", label: "A", kind: "text", role: "report_no" },
        { key: "b", label: "B", kind: "text", role: "report_no" },
      ],
    };
    expect(typeInputSchema.safeParse(roles).success).toBe(false);
    const wrong = { ...base, fields: [{ key: "a", label: "A", kind: "date", role: "report_no" }] };
    expect(typeInputSchema.safeParse(wrong).success).toBe(false);
  });

  it("needs choices for a select and columns for a table", () => {
    expect(
      typeInputSchema.safeParse({ ...base, fields: [{ key: "a", label: "A", kind: "select" }] })
        .success,
    ).toBe(false);
    expect(
      typeInputSchema.safeParse({ ...base, fields: [{ key: "a", label: "A", kind: "table" }] })
        .success,
    ).toBe(false);
  });

  it("makes safe slugs and keys", () => {
    expect(slugify("AIGS Gemstone Report!")).toBe("aigs-gemstone-report");
    expect(keyFromLabel("Report No.")).toBe("report_no");
    expect(keyFromLabel("2nd Date")).toBe("f_2nd_date");
  });
});
