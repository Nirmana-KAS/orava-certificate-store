// Turns the words Tesseract found into visual rows and segments, by position on the page.
// Tesseract's own line grouping follows its block layout, which splits a "Label ..... value"
// row in two when the gap is wide; rebuilding rows from word boxes keeps label and value together.

export interface OcrWord {
  text: string;
  /** 0 to 100 */
  conf: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One page after OCR. `ink` (optional) gives the share of dark pixels in a box, for tick boxes. */
export interface OcrPage {
  width: number;
  height: number;
  words: OcrWord[];
  ink?: (x0: number, y0: number, x1: number, y1: number) => number;
}

export interface Segment {
  words: OcrWord[];
  text: string;
  x0: number;
  x1: number;
}

export interface Row {
  words: OcrWord[];
  segments: Segment[];
  y0: number;
  y1: number;
  /** Typical letter height in this row */
  h: number;
  page: number;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Noise: words with no letter or digit (lone ":", "|", "—" from rules and boxes, but "&" is
 * kept), and short words Tesseract itself barely believes (specks read as "La" or "ill"),
 * except a lone "x" which is the "by" in sizes like 5.20 x 3.39 mm.
 */
const isNoise = (w: OcrWord) =>
  !/[\p{L}\p{N}&+:]/u.test(w.text) ||
  (w.conf < 30 && w.text.length <= 3 && !/^[x×]$/i.test(w.text));

export function buildRows(page: OcrPage, pageIndex = 0): Row[] {
  const words = page.words.filter((w) => !isNoise(w) && w.y1 > w.y0 && w.x1 > w.x0);
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rows: { words: OcrWord[]; cy: number; h: number }[] = [];
  for (const w of sorted) {
    const cy = (w.y0 + w.y1) / 2;
    const h = w.y1 - w.y0;
    // Join the closest existing row whose centre is within half a letter height
    let best: (typeof rows)[number] | null = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 6; i--) {
      const r = rows[i];
      if (Math.abs(r.cy - cy) <= Math.max(r.h, h) * 0.5) {
        if (!best || Math.abs(r.cy - cy) < Math.abs(best.cy - cy)) best = r;
      }
    }
    if (best) {
      best.words.push(w);
      const n = best.words.length;
      best.cy = (best.cy * (n - 1) + cy) / n;
      best.h = median(best.words.map((x) => x.y1 - x.y0));
    } else {
      rows.push({ words: [w], cy, h });
    }
  }

  return rows
    .map((r) => {
      const all = r.words.sort((a, b) => a.x0 - b.x0);
      const rowH = Math.max(1, median(all.map((x) => x.y1 - x.y0)));
      // Much smaller than the letters around it: a footnote star or a speck, not text
      const kept = all.filter((x) => x.y1 - x.y0 >= rowH * 0.45);
      const ws = kept.length ? kept : all;
      const h = Math.max(1, median(ws.map((x) => x.y1 - x.y0)));
      const segments: Segment[] = [];
      let cur: OcrWord[] = [];
      for (const w of ws) {
        const prev = cur[cur.length - 1];
        // A gap wider than about three letters starts a new segment (a new column)
        if (prev && w.x0 - prev.x1 > h * 2.5) {
          segments.push(segmentOf(cur));
          cur = [];
        }
        cur.push(w);
      }
      if (cur.length) segments.push(segmentOf(cur));
      return {
        words: ws,
        segments,
        y0: Math.min(...ws.map((x) => x.y0)),
        y1: Math.max(...ws.map((x) => x.y1)),
        h,
        page: pageIndex,
      };
    })
    .sort((a, b) => a.y0 - b.y0);
}

function segmentOf(words: OcrWord[]): Segment {
  return {
    words,
    text: words.map((w) => w.text).join(" "),
    x0: words[0].x0,
    x1: words[words.length - 1].x1,
  };
}

/** Plain text of the page, row by row, for search and for showing the admin what was read. */
export function rowsToText(rows: Row[]): string {
  return rows.map((r) => r.segments.map((s) => s.text).join("    ")).join("\n");
}
