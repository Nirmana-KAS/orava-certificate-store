// Fills a certificate type's fields from the words found by OCR, using each field's hints:
// label words to look for, a value pattern, and the field kind. Pure, so it runs in the browser
// and in the unit tests. The admin always sees what was found before anything is final.

import { buildRows, type OcrPage, type OcrWord, type Row, type Segment } from "../ocr/layout.ts";
import type { FieldDef } from "../types/schema.ts";

import {
  cleanText,
  customPattern,
  findCarat,
  findDate,
  findInteger,
  findNumber,
  findReportNumber,
  findSize,
} from "./values.ts";

export type FieldStatus = "found" | "check" | "missing";
export type ExtractedValue = string | string[] | Record<string, string>[] | null;

export interface FieldResult {
  value: ExtractedValue;
  status: FieldStatus;
  /** Mean OCR confidence of the words used, 0 to 100 */
  conf: number;
  /** Why the admin should look again, in plain words */
  note?: string;
}

export interface Extraction {
  fields: Record<string, FieldResult>;
  found: number;
  check: number;
  missing: number;
  /** Labels of required fields that are empty */
  requiredMissing: string[];
}

export interface TypeForDetect {
  id: string;
  name: string;
  fingerprints: string[];
  fields: FieldDef[];
}

export interface Detection {
  typeId: string | null;
  /** 0 to 1 */
  score: number;
  confident: boolean;
  ranking: { typeId: string; name: string; score: number }[];
}

// ---------------------------------------------------------------------------------------------
// Fuzzy text helpers

/** Lower-case letters and digits only; "N°" becomes "no". */
export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[°º]/g, "o")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Smallest edit distance between `needle` and any part of `hay` (approximate search). */
export function fuzzyFind(hay: string, needle: string): number {
  if (!needle) return 0;
  if (hay.includes(needle)) return 0;
  let prev = new Array<number>(needle.length + 1);
  for (let j = 0; j <= needle.length; j++) prev[j] = j;
  let best = prev[needle.length];
  for (let i = 1; i <= hay.length; i++) {
    const cur = [0];
    for (let j = 1; j <= needle.length; j++) {
      cur.push(
        Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (hay[i - 1] === needle[j - 1] ? 0 : 1)),
      );
    }
    if (cur[needle.length] < best) best = cur[needle.length];
    prev = cur;
  }
  return best;
}

/** How many OCR mistakes a label of this length may have and still count. */
const allowedEdits = (len: number) => (len <= 4 ? 0 : len <= 7 ? 1 : len <= 12 ? 2 : 3);

interface LabelHit {
  /** Index of the first value word in the segment */
  after: number;
  /** Index of the first label word */
  start: number;
  score: number;
}

/** Looks for a label at the start of a segment (a little noise before it is allowed). */
function matchLabel(seg: Segment, label: string): LabelHit | null {
  const target = norm(label);
  if (!target) return null;
  const allowed = allowedEdits(target.length);
  const words = seg.words.map((w) => norm(w.text));
  let best: LabelHit | null = null;
  for (let start = 0; start < Math.min(3, words.length); start++) {
    // Words before the label must be short noise ("|", "[", "e")
    if (words.slice(0, start).some((w) => w.length > 2)) break;
    let joined = "";
    for (let end = start; end < words.length && end < start + 8; end++) {
      joined += words[end];
      if (joined.length > target.length + allowed + 1) break;
      if (joined.length < target.length - allowed) continue;
      const d = levenshtein(joined, target, allowed);
      if (d <= allowed) {
        const score = target.length * 10 - d * 6 - start * 2;
        if (!best || score > best.score) best = { start, after: end + 1, score };
      }
    }
  }
  return best;
}

const labelsOf = (f: { label: string; hints?: { labels?: string[] } }) => {
  const own = f.hints?.labels?.filter((l) => l.trim()) ?? [];
  return own.length ? own : [f.label];
};

// ---------------------------------------------------------------------------------------------
// Finding where each field's label is

interface Place {
  row: number;
  seg: number;
  hit: LabelHit;
  key: string;
}

/** For every segment, the field whose label matches best. A segment belongs to one field only. */
function placeLabels(rows: Row[], fields: FieldDef[]): Map<string, Place> {
  const claims = new Map<string, Place>(); // "row:seg" -> best place
  for (let r = 0; r < rows.length; r++) {
    rows[r].segments.forEach((seg, s) => {
      for (const f of fields) {
        if (f.kind === "table") continue;
        for (const label of labelsOf(f)) {
          const hit = matchLabel(seg, label);
          if (!hit) continue;
          const id = `${r}:${s}`;
          const cur = claims.get(id);
          if (!cur || hit.score > cur.hit.score)
            claims.set(id, { row: r, seg: s, hit, key: f.key });
        }
      }
    });
  }
  // For each field, its best segment; the highest one on the page wins a tie
  const byField = new Map<string, Place>();
  for (const p of claims.values()) {
    const cur = byField.get(p.key);
    if (!cur || p.hit.score > cur.hit.score) byField.set(p.key, p);
  }
  return byField;
}

// ---------------------------------------------------------------------------------------------
// Reading values next to a label

interface Raw {
  text: string;
  words: OcrWord[];
}

const raw = (words: OcrWord[]): Raw => ({ text: words.map((w) => w.text).join(" "), words });

/** The words after the label in its segment: "Report No. GF26070746". */
function restOfSegment(rows: Row[], p: Place): Raw | null {
  const rest = rows[p.row].segments[p.seg].words.slice(p.hit.after);
  return rest.length ? raw(rest) : null;
}

/** The next segment on the row: "Weight ........ 0.320 ct" once the dots are gone. */
function nextSegment(rows: Row[], p: Place): Raw | null {
  const next = rows[p.row].segments[p.seg + 1];
  return next ? raw(next.words) : null;
}

/** Marker for "the lines below the label" in the list of places to look. */
const below = () => null;

/** "62    Gemstone(s)": the value printed before its label. */
function valueBefore(rows: Row[], p: Place): Raw | null {
  const row = rows[p.row];
  const seg = row.segments[p.seg];
  const before = seg.words.slice(0, p.hit.start);
  if (before.length) return raw(before);
  const prev = row.segments[p.seg - 1];
  return prev ? raw(prev.words) : null;
}

/** Rows under a label that line up with it, for long text such as comments. */
function valueBelow(rows: Row[], p: Place, places: Map<string, Place>): Raw | null {
  const row = rows[p.row];
  const seg = row.segments[p.seg];
  const claimed = new Set([...places.values()].map((x) => `${x.row}:${x.seg}`));
  const words: OcrWord[] = [];
  let lastY = row.y1;
  for (let r = p.row + 1; r < rows.length && r <= p.row + 10; r++) {
    const next = rows[r];
    if (next.y0 - lastY > row.h * 2.6) break;
    // The segment that starts near the label's left edge (allow a small indent)
    const s = next.segments.findIndex(
      (x) => x.x0 >= seg.x0 - row.h * 2 && x.x0 <= seg.x0 + row.h * 6,
    );
    if (s < 0) continue;
    if (claimed.has(`${r}:${s}`)) break;
    words.push(...next.segments[s].words);
    lastY = next.y1;
    if (words.length > 120) break;
  }
  return words.length ? raw(words) : null;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const meanConf = (ws: OcrWord[]) =>
  ws.length ? Math.round(ws.reduce((a, w) => a + w.conf, 0) / ws.length) : 0;

const result = (value: ExtractedValue, conf: number, note?: string): FieldResult => ({
  value,
  conf,
  status:
    value === null || (Array.isArray(value) && value.length === 0)
      ? "missing"
      : note || conf < 70
        ? "check"
        : "found",
  ...(note ? { note } : {}),
});

const MISSING: FieldResult = { value: null, status: "missing", conf: 0 };
const FOUND_WITHOUT_LABEL = "Found without a label.";

/** Turns the raw words into a value of the field's kind. */
function readValue(f: FieldDef, input: Raw): FieldResult {
  // Short, doubtful words at either end are usually marks next to the value, not part of it
  const weak = (w: OcrWord) => w.text.length <= 3 && w.conf < 50;
  let a = 0;
  let b = input.words.length;
  while (a < b && weak(input.words[a])) a++;
  while (b > a && weak(input.words[b - 1])) b--;
  const r = a === 0 && b === input.words.length ? input : raw(input.words.slice(a, b));
  if (!r.words.length) return MISSING;
  const conf = meanConf(r.words);
  const pattern = f.hints?.pattern;
  const custom = customPattern(pattern);

  if (f.kind === "date") {
    const d = findDate(r.text);
    return d ? result(d.value, conf) : result(null, conf);
  }
  if (f.kind === "carat") {
    const v = findCarat(r.text);
    return result(v, conf);
  }
  if (f.kind === "number") {
    const v = pattern === "integer" ? findInteger(r.text) : findNumber(r.text);
    return result(v, conf);
  }
  if (f.kind === "select") {
    const text = norm(r.text);
    let best: { o: string; d: number } | null = null;
    for (const o of f.options ?? []) {
      const d = fuzzyFind(text, norm(o));
      if (d <= allowedEdits(norm(o).length) && (!best || d < best.d)) best = { o, d };
    }
    return best
      ? result(best.o, conf, best.d ? "Closest choice to what was read." : undefined)
      : result(null, conf);
  }

  let text = cleanText(r.text);
  if (pattern === "report_number" || custom) {
    const tokens = text.split(/\s+/).map((t) => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""));
    const exact = custom ? tokens.find((t) => custom.test(t.toUpperCase())) : null;
    if (exact) return result(exact.toUpperCase(), conf);
    const v = findReportNumber(text);
    if (!v) return result(null, conf);
    return result(v, conf, custom ? "Doesn't match the expected pattern." : undefined);
  }
  if (pattern === "mm_size") {
    const v = findSize(text);
    return result(v ?? (text || null), conf, v ? undefined : "Couldn't read the sizes.");
  }
  if (pattern === "date") {
    const d = findDate(text);
    if (d) return result(d.value, conf);
  }
  if (f.kind === "longtext") text = text.slice(0, 2000);
  else text = text.slice(0, 300);
  return result(text || null, conf);
}

// ---------------------------------------------------------------------------------------------
// Tick boxes (multi-select): an option counts when the box to its left has ink inside

function readTicks(f: FieldDef, rows: Row[], page: OcrPage, place: Place | undefined): FieldResult {
  const options = f.options ?? [];
  if (!options.length) return MISSING;
  const from = place ? place.row : 0;
  const to = place ? Math.min(rows.length, place.row + 8) : rows.length;
  const picked: string[] = [];
  let seen = 0;
  for (const o of options) {
    const target = norm(o);
    const allowed = allowedEdits(target.length);
    // The closest match wins, so "(M Microscope" (box read as a letter) loses to "Microscope"
    let hit: { w: OcrWord; d: number; row: number } | null = null;
    for (let r = from; r < to; r++) {
      const ws = rows[r].words;
      for (let i = 0; i < ws.length; i++) {
        let joined = "";
        for (let j = i; j < ws.length && j < i + 4; j++) {
          joined += norm(ws[j].text);
          if (joined.length > target.length + allowed) break;
          const d = levenshtein(joined, target, allowed);
          if (d <= allowed && (!hit || d < hit.d)) hit = { w: ws[i], d, row: r };
        }
      }
    }
    if (!hit) continue;
    seen++;
    if (!page.ink) continue;
    const h = hit.w.y1 - hit.w.y0;
    // OCR sometimes takes the box into the word ("VEDXRF", or a box that is only wider than
    // the text): compare with the typical letter width on the row to find where the text starts
    const charW = median(
      rows[hit.row].words
        .filter((w) => w !== hit.w && w.text.length >= 3)
        .map((w) => (w.x1 - w.x0) / w.text.length),
    );
    const width = hit.w.x1 - hit.w.x0;
    const extra = charW ? width - target.length * charW : 0;
    const start = extra > h * 0.8 ? hit.w.x0 + extra : hit.w.x0;
    // The box sits left of the word, about one to four letter heights away
    const share = page.ink(
      Math.max(0, start - h * 4.2),
      Math.max(0, hit.w.y0 - h * 0.5),
      Math.max(0, start - h * 0.3),
      Math.min(page.height, hit.w.y1 + h * 0.5),
    );
    if (share >= TICK_INK) picked.push(o);
  }
  if (seen === 0) return MISSING;
  if (!page.ink) return { value: [], status: "check", conf: 0, note: "Tick the boxes by hand." };
  return { value: picked, status: picked.length ? "found" : "check", conf: 80 };
}

/** Share of ink inside the middle of a tick box that means "ticked" (an empty box is ~0). */
export const TICK_INK = 0.06;

// ---------------------------------------------------------------------------------------------
// Tables: find the header row by the column names, then read the rows under it

function readTable(f: FieldDef, rows: Row[]): FieldResult {
  const columns = f.columns ?? [];
  if (!columns.length) return MISSING;
  let header: { row: number; cols: { key: string; x0: number; x1: number }[] } | null = null;
  for (let r = 0; r < rows.length; r++) {
    const words = rows[r].words;
    const cols: { key: string; x0: number; x1: number }[] = [];
    for (const c of columns) {
      const names = [c.label, ...((c as { labels?: string[] }).labels ?? [])];
      let found: { x0: number; x1: number; len: number } | null = null;
      for (const name of names) {
        const target = norm(name);
        if (!target) continue;
        for (let i = 0; i < words.length; i++) {
          let joined = "";
          for (let j = i; j < words.length && j < i + 5; j++) {
            joined += norm(words[j].text);
            if (joined.length > target.length + 2) break;
            // Column names are short ("Pc(s)" read as "Pe(s)"): allow one slip even then
            const allowed = Math.max(target.length >= 3 ? 1 : 0, allowedEdits(target.length));
            if (levenshtein(joined, target, allowed) <= allowed) {
              if (!found || target.length > found.len) {
                found = { x0: words[i].x0, x1: words[j].x1, len: target.length };
              }
            }
          }
        }
      }
      if (found) cols.push({ key: c.key, x0: found.x0, x1: found.x1 });
    }
    if (cols.length >= 2 && (!header || cols.length > header.cols.length))
      header = { row: r, cols };
  }
  if (!header) return MISSING;

  const cols = [...header.cols].sort((a, b) => a.x0 - b.x0);
  const bounds = cols.map((c, i) =>
    i === cols.length - 1 ? Infinity : (c.x1 + cols[i + 1].x0) / 2,
  );
  const kindOf = new Map(columns.map((c) => [c.key, c.kind]));
  const out: Record<string, string>[] = [];
  const confs: number[] = [];
  const h = rows[header.row].h;
  let lastY = rows[header.row].y1;
  let misses = 0;
  for (let r = header.row + 1; r < rows.length && out.length < 200; r++) {
    const row = rows[r];
    if (row.y0 - lastY > h * (out.length ? 3.5 : 8)) break;
    const cells: Record<string, OcrWord[]> = {};
    for (const w of row.words) {
      const cx = (w.x0 + w.x1) / 2;
      const i = bounds.findIndex((b) => cx < b);
      const key = cols[i]?.key;
      if (key) (cells[key] ??= []).push(w);
    }
    const values: Record<string, string> = {};
    let numeric = 0;
    for (const c of columns) {
      const ws = cells[c.key];
      if (!ws?.length) {
        values[c.key] = "";
        continue;
      }
      const text = ws.map((w) => w.text).join(" ");
      const kind = kindOf.get(c.key);
      let v: string | null;
      if (kind === "carat") v = findCarat(text);
      else if (kind === "number") v = findNumber(text);
      else if (kind === "date") v = findDate(text)?.value ?? null;
      else v = cleanText(text);
      if (v && (kind === "carat" || kind === "number")) numeric++;
      values[c.key] = v ?? "";
    }
    const filled = Object.values(values).filter(Boolean).length;
    const needsNumber = columns.some((c) => c.kind === "carat" || c.kind === "number");
    if (filled >= 2 && (!needsNumber || numeric > 0)) {
      out.push(values);
      confs.push(meanConf(row.words));
      lastY = row.y1;
      misses = 0;
    } else if (out.length) {
      if (++misses > 1) break;
    }
  }
  if (!out.length) return MISSING;
  const conf = Math.round(confs.reduce((a, b) => a + b, 0) / confs.length);
  return { value: out, status: conf >= 70 ? "found" : "check", conf };
}

// ---------------------------------------------------------------------------------------------

/** Rows from all pages, one after the other. */
export function pagesToRows(pages: OcrPage[]): Row[] {
  const rows: Row[] = [];
  let offset = 0;
  pages.forEach((p, i) => {
    for (const r of buildRows(p, i)) {
      rows.push({
        ...r,
        y0: r.y0 + offset,
        y1: r.y1 + offset,
        words: r.words,
      });
    }
    offset += p.height + 1;
  });
  return rows;
}

export function extractFields(pages: OcrPage[], fields: FieldDef[]): Extraction {
  const rows = pagesToRows(pages);
  const places = placeLabels(rows, fields);
  const out: Record<string, FieldResult> = {};

  for (const f of fields) {
    const place = places.get(f.key);
    let res: FieldResult = MISSING;

    if (f.kind === "table") {
      res = readTable(f, rows);
    } else if (f.kind === "multiselect") {
      res = readTicks(f, rows, pages[place ? rows[place.row].page : 0] ?? pages[0], place);
    } else if (place) {
      // Try, in order: the rest of the label's segment, the next segment, the lines below
      // (long text only), and the words before the label ("62  Gemstone(s)")
      for (const read of [restOfSegment, nextSegment, below, valueBefore]) {
        if (read === below && f.kind !== "longtext") continue;
        const r = read === below ? valueBelow(rows, place, places) : read(rows, place);
        if (!r) continue;
        const v = readValue(f, r);
        if (v.status !== "missing") {
          res = v;
          break;
        }
      }
    }

    // A date with no label ("September 17, 2026" under the report number): first date on the page
    if (res.status === "missing" && f.kind === "date" && !place) {
      for (const row of rows) {
        const d = findDate(row.words.map((w) => w.text).join(" "));
        if (d) {
          res = {
            value: d.value,
            status: "check",
            conf: meanConf(row.words),
            note: FOUND_WITHOUT_LABEL,
          };
          break;
        }
      }
    }
    out[f.key] = res;
  }

  const list = Object.values(out);
  return {
    fields: out,
    found: list.filter((r) => r.status === "found").length,
    check: list.filter((r) => r.status === "check").length,
    missing: list.filter((r) => r.status === "missing").length,
    requiredMissing: fields
      .filter((f) => f.required && out[f.key]?.status === "missing")
      .map((f) => f.label),
  };
}

/** Which type is this page? Fingerprint phrases count most, then how many field labels are present. */
export function detectType(pages: OcrPage[], types: TypeForDetect[]): Detection {
  const rows = pagesToRows(pages);
  const text = norm(rows.map((r) => r.words.map((w) => w.text).join(" ")).join(" "));
  const ranking = types
    .map((t) => {
      const fps = t.fingerprints.map(norm).filter(Boolean);
      let fpTotal = 0;
      let fpHit = 0;
      for (const fp of fps) {
        fpTotal += fp.length;
        if (fuzzyFind(text, fp) <= Math.floor(fp.length / 8)) fpHit += fp.length;
      }
      const simple = t.fields.filter((f) => f.kind !== "table");
      const places = placeLabels(rows, simple);
      const labelShare = simple.length ? places.size / simple.length : 0;
      const fpShare = fpTotal ? fpHit / fpTotal : 0;
      const score = fpTotal ? fpShare * 0.65 + labelShare * 0.35 : labelShare * 0.6;
      return { typeId: t.id, name: t.name, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranking[0];
  const second = ranking[1]?.score ?? 0;
  const confident = !!best && best.score >= 0.45 && best.score - second >= 0.12;
  return {
    typeId: best && best.score >= 0.25 ? best.typeId : null,
    score: best?.score ?? 0,
    confident,
    ranking,
  };
}

const rank = (r: FieldResult) =>
  r.status === "found" ? 3 : r.status === "check" ? (r.note ? 1 : 2) : 0;

/** Keeps, field by field, the better of two readings of the same file. */
export function mergeExtractions(a: Extraction, b: Extraction, fields: FieldDef[]): Extraction {
  const out: Record<string, FieldResult> = {};
  for (const f of fields) {
    const x = a.fields[f.key] ?? MISSING;
    const y = b.fields[f.key] ?? MISSING;
    out[f.key] = rank(y) > rank(x) || (rank(y) === rank(x) && y.conf > x.conf + 10) ? y : x;
  }
  const list = Object.values(out);
  return {
    fields: out,
    found: list.filter((r) => r.status === "found").length,
    check: list.filter((r) => r.status === "check").length,
    missing: list.filter((r) => r.status === "missing").length,
    requiredMissing: fields
      .filter((f) => f.required && out[f.key]?.status === "missing")
      .map((f) => f.label),
  };
}

/** A second, lighter reading is worth it when a required field is missing or looks wrong. */
export function needsReread(ex: Extraction, fields: FieldDef[]): boolean {
  return fields.some((f) => {
    const r = ex.fields[f.key];
    return (
      (f.required && r?.status !== "found") ||
      (r?.status === "check" && !!r.note && r.note !== FOUND_WITHOUT_LABEL)
    );
  });
}

/** Safe to save without the admin looking: every required field read cleanly. */
export function readyToSave(ex: Extraction, fields: FieldDef[]): boolean {
  return (
    ex.requiredMissing.length === 0 &&
    fields.every(
      (f) => !f.required || (ex.fields[f.key]?.status !== "missing" && !ex.fields[f.key]?.note),
    )
  );
}
