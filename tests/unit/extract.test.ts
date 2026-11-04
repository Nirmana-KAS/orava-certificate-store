import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  detectType,
  extractFields,
  levenshtein,
  mergeExtractions,
  needsReread,
  norm,
  readyToSave,
} from "@/lib/extract/extract";
import {
  cleanText,
  customPattern,
  findCarat,
  findDate,
  findReportNumber,
  findSize,
  joinSpacedLetters,
} from "@/lib/extract/values";
import { buildRows, type OcrPage, type OcrWord } from "@/lib/ocr/layout";
import { fieldSchema } from "@/lib/types/schema";

import { SAMPLE_TYPES, typeById } from "../helpers/sample-types";

// Pages are built from made-up words placed like on the four sample layouts.
// No real report numbers, customers or stones are used.

const H = 30; // letter height in pixels (about 300 dpi)

/** Words of `text` starting at x on row y, sized like printed text. */
function words(x: number, y: number, text: string, conf = 95, h = H): OcrWord[] {
  const out: OcrWord[] = [];
  let cx = x;
  for (const t of text.split(" ").filter(Boolean)) {
    const w = Math.round(t.length * h * 0.55);
    out.push({ text: t, conf, x0: cx, y0: y, x1: cx + w, y1: y + h });
    cx += w + Math.round(h * 0.35);
  }
  return out;
}

function page(...rows: OcrWord[][]): OcrPage {
  return { width: 3500, height: 2480, words: rows.flat() };
}

describe("values", () => {
  it("reads the date styles on lab reports", () => {
    expect(findDate("15 July 2026")?.value).toBe("2026-07-15");
    expect(findDate("September 17, 2026")?.value).toBe("2026-09-17");
    expect(findDate("Tuesday, January 27, 2026")?.value).toBe("2026-01-27");
    expect(findDate("2026-03-04")?.value).toBe("2026-03-04");
    expect(findDate("04/03/2026")?.value).toBe("2026-03-04");
    expect(findDate("31 February 2026")).toBeNull();
    expect(findDate("no date here")).toBeNull();
  });

  it("reads weights, sizes and report numbers", () => {
    expect(findCarat("0.10 cts")).toBe("0.10");
    expect(findCarat("43,13 cts.")).toBe("43.13");
    expect(findCarat("3 stones, 1.52 ct")).toBe("1.52");
    expect(findSize("= 3.20 x 1.97 x 1.28 mm")).toBe("3.20 x 1.97 x 1.28 mm");
    expect(findSize("5.2 × 3.4 mm")).toBe("5.2 x 3.4 mm");
    expect(findReportNumber(": XY12345678 |")).toBe("XY12345678");
    expect(findReportNumber("Report")).toBeNull();
  });

  it("tidies text values", () => {
    expect(joinSpacedLetters("Natural E M E R A L D")).toBe("Natural EMERALD");
    expect(cleanText(": Madagascar*")).toBe("Madagascar");
    expect(cleanText("— Faceted  Oval |")).toBe("Faceted Oval");
  });

  it("ignores broken custom patterns instead of failing", () => {
    expect(customPattern("re:[A-Z")).toBeNull();
    expect(customPattern("report_number")).toBeNull();
    expect(customPattern("re:[A-Z]{2}\\d{4}")?.test("AB1234")).toBe(true);
    expect(customPattern("re:[A-Z]{2}\\d{4}")?.test("AB12345")).toBe(false);
    expect(customPattern("[A-Z]{2}")).toBeNull();
  });

  it("matches with a few OCR mistakes", () => {
    expect(norm("Reference N°")).toBe("referenceno");
    expect(levenshtein("measuiements", "measurements")).toBe(1);
  });
});

describe("rows", () => {
  it("keeps a label and its far-away value on one row, in separate segments", () => {
    const rows = buildRows(page(words(140, 600, "Weight"), words(1420, 603, "0.512 ct")));
    expect(rows).toHaveLength(1);
    expect(rows[0].segments.map((s) => s.text)).toEqual(["Weight", "0.512 ct"]);
  });

  it("drops specks and symbols", () => {
    const rows = buildRows(
      page([
        ...words(140, 600, "Origin"),
        { text: "La", conf: 3, x0: 300, y0: 600, x1: 330, y1: 606 },
        { text: "|", conf: 40, x0: 340, y0: 600, x1: 345, y1: 630 },
        ...words(400, 600, "Sri Lanka"),
      ]),
    );
    expect(rows[0].words.map((w) => w.text)).toEqual(["Origin", "Sri", "Lanka"]);
  });
});

describe("AIGS Gemstone Identification Report (sideways booklet)", () => {
  const type = typeById("aigs-gemstone-identification-report");
  // Right half of the page, after turning it upright; the left half has logos and noise
  const p = page(
    words(2270, 90, "Gemstone Identification Report", 95, 60),
    words(2270, 320, "Report No. XY10000001"),
    words(2380, 420, "Date 2 March 2026"),
    words(2340, 530, "Weight 1.25 cts"),
    words(2350, 640, "Shape Oval"),
    words(2390, 750, "Cut Faceted"),
    words(2160, 860, "Measurements 6.10 x 5.02 x 3.11 mm"),
    words(1500, 970, "emesis", 30),
    words(2380, 970, "Color Blue"),
    words(2370, 1080, "Origin Sri Lanka"),
    words(2110, 1190, "Identification Natural Sapphire"),
    words(2100, 1290, "Comments and Opinions"),
    words(2100, 1390, "No indication of heat treatment"),
    words(1400, 1460, "vig bg", 20),
    words(2120, 1470, "The characteristics are similar to"),
    words(2100, 1510, "those found in sapphires from Sri Lanka"),
    words(2110, 1990, "Instruments Used:"),
    words(2180, 2070, "Microscope"),
    words(2560, 2070, "FTIR"),
    words(2930, 2070, "EDXRF"),
    words(2180, 2150, "UV-Vis-NIR"),
    words(2560, 2150, "LIBS"),
    words(2930, 2150, "DFI"),
    words(200, 2300, "Verify with AIGS App"),
  );
  // Tick boxes: Microscope and EDXRF are ticked
  p.ink = (x0, y0) => {
    const ticked = [2180, 2930].some((x) => x0 > x - 140 && x0 < x) && y0 < 2100 && y0 > 2000;
    return ticked ? 0.3 : 0;
  };

  it("is recognised", () => {
    const d = detectType([p], SAMPLE_TYPES);
    expect(d.typeId).toBe(type.id);
    expect(d.confident).toBe(true);
  });

  it("fills every field", () => {
    const ex = extractFields([p], type.fields);
    const v = (k: string) => ex.fields[k]?.value;
    expect(v("report_no")).toBe("XY10000001");
    expect(v("date")).toBe("2026-03-02");
    expect(v("weight")).toBe("1.25");
    expect(v("shape")).toBe("Oval");
    expect(v("cut")).toBe("Faceted");
    expect(v("measurements")).toBe("6.10 x 5.02 x 3.11 mm");
    expect(v("color")).toBe("Blue");
    expect(v("origin")).toBe("Sri Lanka");
    expect(v("identification")).toBe("Natural Sapphire");
    expect(v("comments")).toBe(
      "No indication of heat treatment The characteristics are similar to those found in sapphires from Sri Lanka",
    );
    expect(v("instruments")).toEqual(["Microscope", "EDXRF"]);
    expect(ex.missing).toBe(0);
    expect(readyToSave(ex, type.fields)).toBe(true);
  });

  it("flags a report number that doesn't fit the pattern, and a second reading can fix it", () => {
    const bad = page(
      ...p.words.map((w) => [w.text === "XY10000001" ? { ...w, text: "XY100000011" } : w]),
    );
    const first = extractFields([bad], type.fields);
    expect(first.fields.report_no.status).toBe("check");
    expect(needsReread(first, type.fields)).toBe(true);
    expect(readyToSave(first, type.fields)).toBe(false);
    const merged = mergeExtractions(first, extractFields([p], type.fields), type.fields);
    expect(merged.fields.report_no.value).toBe("XY10000001");
    expect(readyToSave(merged, type.fields)).toBe(true);
  });

  it("leaves tick boxes for the admin when there is no image to measure", () => {
    const ex = extractFields([{ ...p, ink: undefined }], type.fields);
    expect(ex.fields.instruments.status).toBe("check");
  });
});

describe("AIGS Analysis Short Report (table with borders)", () => {
  const type = typeById("aigs-analysis-short-report");
  const L = 360;
  const V = 980;
  const p = page(
    words(800, 700, "ANALYSIS SHORT REPORT: Identification Check"),
    [...words(L, 960, "Report No"), ...words(V, 960, "AB20000002")],
    [...words(L, 1090, "Customer"), ...words(V, 1090, "Example Gems Ltd.")],
    [...words(L, 1220, "Reference"), ...words(V, 1220, "LAB000111")],
    [...words(L, 1350, "Date of Submission"), ...words(V, 1350, "5 May 2026")],
    [...words(L, 1480, "Description"), ...words(V, 1480, "2 lots of gemstones, unset")],
    [...words(L, 1610, "Total weight"), ...words(V, 1610, "12.40 cts.")],
    [...words(L, 1740, "Shape and cut"), ...words(V, 1740, "Fancy, Faceted")],
    [...words(L, 1870, "Quantity (pieces)"), ...words(V, 1870, "40 pieces")],
    [...words(L, 2000, "Identification"), ...words(V, 2000, "40 pieces : Natural Spinel")],
    [...words(L, 2130, "Date of Issue"), ...words(V, 2130, "9 May 2026")],
  );

  it("is recognised and filled, keeping the two dates apart", () => {
    expect(detectType([p], SAMPLE_TYPES).typeId).toBe(type.id);
    const ex = extractFields([p], type.fields);
    const v = (k: string) => ex.fields[k]?.value;
    expect(v("report_no")).toBe("AB20000002");
    expect(v("customer")).toBe("Example Gems Ltd.");
    expect(v("reference")).toBe("LAB000111");
    expect(v("submitted")).toBe("2026-05-05");
    expect(v("date")).toBe("2026-05-09");
    expect(v("weight")).toBe("12.40");
    expect(v("shape_cut")).toBe("Fancy, Faceted");
    expect(v("quantity")).toBe("40");
    expect(v("identification")).toBe("40 pieces : Natural Spinel");
    expect(ex.found).toBe(type.fields.length);
  });
});

describe("Bellerophon Gemmological Report (dotted leaders, sideways)", () => {
  const type = typeById("bellerophon-gemmological-report");
  const V = 1200;
  const p = page(
    words(670, 140, "Bellerophon", 95, 80),
    [
      ...words(140, 320, "GEMMOLOGICAL REPORT | RAPPORT GEMMOLOGIQUE"),
      ...words(1150, 320, "REPORT No."),
      ...words(1430, 320, "Z12345"),
    ],
    words(1250, 370, "March 3, 2026"),
    [...words(140, 600, "Description"), ...words(V, 600, "One loose gemstone")],
    [...words(140, 670, "Weight"), ...words(V + 200, 670, "1.050 ct")],
    [...words(140, 740, "Measurements"), ...words(V, 740, "7.20 x 5.10 x 3.30 mm")],
    [...words(140, 810, "Cut & Shape"), ...words(V, 810, "Faceted Cushion")],
    [
      ...words(140, 900, "Identification"),
      ...words(V - 30, 900, "Natural"),
      ...words(V + 160, 900, "S P I N E L"),
    ],
    [...words(140, 1000, "Color"), ...words(V + 100, 1000, "Vivid Pink")],
    [...words(140, 1070, "Color Distribution"), ...words(V + 250, 1070, "Even")],
    [...words(140, 1140, "Color Stability"), ...words(V + 250, 1140, "Stable")],
    [...words(140, 1230, "Clarity"), ...words(V + 150, 1230, "Transparent")],
    [...words(140, 1300, "Fluorescence"), ...words(V + 250, 1300, "Weak")],
    [...words(140, 1370, "Comment"), ...words(V, 1370, "No indications of heating")],
    [
      ...words(140, 1440, "Provenance"),
      ...words(V, 1440, "Burma (Myanmar)"),
      ...words(2900, 1440, "Profile not to actual proportion"),
    ],
    [...words(140, 1574, "Age"), ...words(V, 1574, "~ 500 million years")],
  );

  it("is recognised and filled; the date without a label is marked to check", () => {
    expect(detectType([p], SAMPLE_TYPES).typeId).toBe(type.id);
    const ex = extractFields([p], type.fields);
    const v = (k: string) => ex.fields[k]?.value;
    expect(v("report_no")).toBe("Z12345");
    expect(v("date")).toBe("2026-03-03");
    expect(ex.fields.date.status).toBe("check");
    expect(v("weight")).toBe("1.050");
    expect(v("measurements")).toBe("7.20 x 5.10 x 3.30 mm");
    expect(v("cut_shape")).toBe("Faceted Cushion");
    expect(v("identification")).toBe("Natural SPINEL");
    expect(v("color")).toBe("Vivid Pink");
    expect(v("color_distribution")).toBe("Even");
    expect(v("color_stability")).toBe("Stable");
    expect(v("clarity")).toBe("Transparent");
    expect(v("fluorescence")).toBe("Weak");
    expect(v("comment")).toBe("No indications of heating");
    expect(v("origin")).toBe("Burma (Myanmar)");
    expect(v("age")).toBe("500 million years");
    expect(readyToSave(ex, type.fields)).toBe(true);
  });
});

describe("Bellerophon Gemmological Testing Results (batch table)", () => {
  const type = typeById("bellerophon-gemmological-testing-results");
  const p = page(
    words(980, 330, "Bellerophon | Gemlab"),
    words(120, 830, "Gemmological Testing Results"),
    words(120, 880, "Monday, February 2, 2026"),
    [...words(120, 930, "18"), ...words(280, 930, "Gemstone(s)")],
    words(120, 980, "Reference N° Q00042"),
    [
      ...words(117, 1255, "Reference Item No.", 95, 25),
      ...words(540, 1255, "Carat", 95, 25),
      ...words(677, 1255, "Identification", 95, 25),
      ...words(1380, 1255, "Comment(s)", 95, 25),
      ...words(2210, 1255, "Pc(s)", 95, 25),
    ],
    [
      ...words(117, 1304, "Z00001", 90, 25),
      ...words(539, 1302, "0.410", 90, 25),
      ...words(677, 1301, "Natural RUBY", 90, 25),
      ...words(1240, 1301, "No Heat & Heated*", 90, 25),
      ...words(2240, 1301, "6", 90, 25),
    ],
    [
      ...words(117, 1356, "Z00002", 90, 25),
      ...words(556, 1356, "4.18", 90, 25),
      ...words(677, 1355, "Natural SPINEL", 90, 25),
      ...words(1240, 1355, "No indications of any treatment*", 90, 25),
      ...words(2225, 1355, "12", 90, 25),
    ],
    words(120, 2000, "What did we tested: Identification, Genesis and treatment(s)*"),
    words(120, 2050, "How did we tested: Raman, PL, FTIR"),
  );

  it("is recognised and reads the header, the count before its label and the table", () => {
    expect(detectType([p], SAMPLE_TYPES).typeId).toBe(type.id);
    const ex = extractFields([p], type.fields);
    const v = (k: string) => ex.fields[k]?.value;
    expect(v("reference_no")).toBe("Q00042");
    expect(v("date")).toBe("2026-02-02");
    expect(v("total_gemstones")).toBe("18");
    expect(v("tested_for")).toBe("Identification, Genesis and treatment(s)");
    expect(v("methods")).toBe("Raman, PL, FTIR");
    expect(v("results")).toEqual([
      {
        item_no: "Z00001",
        carat: "0.410",
        identification: "Natural RUBY",
        comment: "No Heat & Heated",
        pieces: "6",
      },
      {
        item_no: "Z00002",
        carat: "4.18",
        identification: "Natural SPINEL",
        comment: "No indications of any treatment",
        pieces: "12",
      },
    ]);
  });
});

describe("type detection", () => {
  it("says so when nothing matches", () => {
    const d = detectType([page(words(100, 100, "Shopping list: milk, bread"))], SAMPLE_TYPES);
    expect(d.typeId).toBeNull();
    expect(d.confident).toBe(false);
  });
});

describe("seeded reading hints", () => {
  it("match migration 0004 and pass the field rules", () => {
    const sql = readFileSync("supabase/migrations/0004_extraction.sql", "utf8");
    for (const t of SAMPLE_TYPES) {
      const m = new RegExp(
        `fields = '(.+?)'::jsonb, updated_at = now\\(\\)\\n  where slug = '${t.id}'`,
      ).exec(sql);
      expect(m, t.id).not.toBeNull();
      expect(JSON.parse(m![1].replace(/''/g, "'"))).toEqual(t.fields);
      for (const f of t.fields)
        expect(fieldSchema.safeParse(f).success, `${t.id}.${f.key}`).toBe(true);
    }
  });
});
