// Reading values out of OCR text: dates, carats, sizes, report numbers. Pure functions.

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const strip = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function monthOf(word: string): number | null {
  const w = strip(word).replace(/[^a-z]/g, "");
  if (w.length < 3) return null;
  if (MONTHS[w]) return MONTHS[w];
  const short = w.slice(0, 3);
  // "July", "Juiy" (OCR) and "September" all start with a usable 3-letter prefix
  for (const [name, n] of Object.entries(MONTHS)) {
    if (name.length === 3 && name === short) return n;
  }
  return null;
}

/** Fix the usual OCR digit mix-ups inside something that should be a number. */
export function fixDigits(s: string): string {
  return s
    .replace(/[OoQD]/g, "0")
    .replace(/[Il|!]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/B/g, "8");
}

/**
 * Finds a date in text and returns it as YYYY-MM-DD. Handles "15 July 2026",
 * "September 17, 2026", "Tuesday, January 27, 2026", "2026-07-15" and "15/07/2026" (day first).
 */
export function findDate(text: string): { value: string; index: number } | null {
  const t = text.replace(/[,.]/g, (c) => (c === "," ? " " : c));
  // 15 July 2026
  let m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-zÀ-ÿ]{3,10})\.?\s+(\d{4})\b/.exec(t);
  if (m) {
    const mo = monthOf(m[2]);
    const v = mo ? iso(+m[3], mo, +m[1]) : null;
    if (v) return { value: v, index: m.index };
  }
  // September 17, 2026
  m = /\b([A-Za-zÀ-ÿ]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\b/.exec(t);
  if (m) {
    const mo = monthOf(m[1]);
    const v = mo ? iso(+m[3], mo, +m[2]) : null;
    if (v) return { value: v, index: m.index };
  }
  // 2026-07-15
  m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(t);
  if (m) {
    const v = iso(+m[1], +m[2], +m[3]);
    if (v) return { value: v, index: m.index };
  }
  // 15/07/2026 or 15.07.2026 (day first, as on most lab reports)
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(t);
  if (m) {
    const v = iso(+m[3], +m[2], +m[1]) ?? iso(+m[3], +m[1], +m[2]);
    if (v) return { value: v, index: m.index };
  }
  return null;
}

/** First decimal number, e.g. "0.10 cts" gives "0.10", "43,13 ct." gives "43.13". */
export function findNumber(text: string): string | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(text.replace(/(\d)\s*[.,]\s*(\d)/g, "$1.$2"));
  if (!m) return null;
  return m[1].replace(",", ".").replace(/^0+(?=\d)/, "");
}

/** Carat weight: a number, preferring the one followed by ct/cts/carat. */
export function findCarat(text: string): string | null {
  const t = text.replace(/(\d)\s*[.,]\s*(\d)/g, "$1.$2");
  const m = /(\d+(?:\.\d+)?)\s*(?:cts?|carats?|ct\.)\b/i.exec(t);
  return m ? m[1] : findNumber(t);
}

export function findInteger(text: string): string | null {
  const m = /\b(\d{1,7})\b/.exec(text);
  return m ? m[1] : null;
}

/**
 * "≈ 3.20 x 1.97 x 1.28 mm" gives "3.20 x 1.97 x 1.28 mm". The "x" is sometimes lost by OCR,
 * so three decimals in a row followed by "mm" also count.
 */
export function findSize(text: string): string | null {
  const t = text.replace(/(\d)\s*[.,]\s*(\d)/g, "$1.$2");
  const m = /(\d+(?:\.\d+)?)\s*[x×X*]\s*(\d+(?:\.\d+)?)(?:\s*[x×X*]\s*(\d+(?:\.\d+)?))?/.exec(t);
  const loose = /(\d+\.\d+)\s*[x×X*]?\s+(\d+\.\d+)\s*[x×X*]?\s+(\d+\.\d+)\s*mm/i.exec(t);
  const best = loose && (!m || loose.index <= m.index) ? loose : m;
  if (!best) return null;
  return `${[best[1], best[2], best[3]].filter(Boolean).join(" x ")} mm`;
}

/** A report number: a token of letters and digits with at least 3 digits, e.g. GF26070746, B77215. */
export function findReportNumber(text: string): string | null {
  for (const raw of text.split(/\s+/)) {
    const tok = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (tok.length >= 4 && tok.length <= 24 && (tok.match(/\d/g)?.length ?? 0) >= 3) {
      return tok.toUpperCase();
    }
  }
  return null;
}

/** Joins letters that were printed spaced out: "Natural E M E R A L D" gives "Natural EMERALD". */
export function joinSpacedLetters(s: string): string {
  return s.replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, (m) => m.replace(/ /g, ""));
}

/** Tidies a text value: separators at the start, footnote stars and stray symbols at the end. */
export function cleanText(s: string): string {
  return joinSpacedLetters(
    s
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/^[\s:;.,=~≈|_\-–—*]+/, "")
      .replace(/[\s:;,=~|_\-–—*"']+$/, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export const PRESET_PATTERNS = {
  report_number: /^[A-Z0-9][A-Z0-9-]{3,23}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  carat: /^\d+(\.\d+)?$/,
  mm_size: /^\d+(\.\d+)?( x \d+(\.\d+)?){1,2} mm$/,
  integer: /^\d+$/,
} as const;

/**
 * A custom pattern typed by the admin in the type editor, stored as "re:<regex>". Bad or
 * overlong patterns are ignored, never thrown.
 */
export function customPattern(p: string | undefined): RegExp | null {
  if (!p?.startsWith("re:")) return null;
  const body = p.slice(3);
  if (!body || body.length > 200) return null;
  try {
    return new RegExp(`^(?:${body})$`);
  } catch {
    return null;
  }
}
