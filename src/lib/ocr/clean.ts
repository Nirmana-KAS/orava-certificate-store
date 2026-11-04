// Image clean-up before OCR. Pure functions on a grey image, so the same code runs in the
// admin's browser (canvas pixels) and in the unit tests (Node).
//
// Gem lab reports have two things that confuse Tesseract:
//   1. table borders (AIGS short report): the text inside the cells is skipped;
//   2. dotted leaders ("Weight ........ 0.320 ct", Bellerophon): the dots melt into the label.
// So we turn the page into black ink on white, then erase long straight lines and rows of
// small dots. Single dots such as decimal points are kept.

export interface GrayImage {
  width: number;
  height: number;
  /** One byte per pixel, 0 = black, 255 = white */
  data: Uint8Array;
}

/** RGBA pixels (canvas ImageData) to grey. */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    // Rec. 601 luma; transparent pixels count as white
    const a = rgba[p + 3] / 255;
    const y = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    data[i] = Math.round(y * a + 255 * (1 - a));
  }
  return { width, height, data } satisfies GrayImage;
}

/** Otsu's threshold: the grey level that best splits ink from paper. */
export function otsuThreshold(data: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const total = data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Rough pixels-per-inch, assuming the scan is an A4 or Letter page. */
export function estimateDpi(width: number, height: number): number {
  return Math.max(width, height) / 11.4;
}

export interface CleanOptions {
  /** Erase table borders and other long straight lines (default true) */
  removeLines?: boolean;
  /** Added to the automatic ink/paper threshold (default 10) */
  thresholdBoost?: number;
  /** Erase rows of leader dots, dust specks and barcodes (default true) */
  removeLeaders?: boolean;
}

export interface CleanStats {
  threshold: number;
  linePixels: number;
  leaderDots: number;
  specks: number;
  barcodes: number;
}

/** Returns a black-on-white copy that is easier for OCR to read. */
export function cleanForOcr(
  img: GrayImage,
  opts: CleanOptions = {},
): { image: GrayImage; stats: CleanStats } {
  const { width: w, height: h } = img;
  // Never go darker than mid-grey: light grey print (Bellerophon labels) must stay ink,
  // pale background tints must become paper.
  const threshold = Math.min(otsuThreshold(img.data) + (opts.thresholdBoost ?? 10), 200);
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = img.data[i] < threshold ? 1 : 0;

  const dpi = estimateDpi(w, h);
  const stats: CleanStats = { threshold, linePixels: 0, leaderDots: 0, specks: 0, barcodes: 0 };
  if (opts.removeLines !== false) stats.linePixels = eraseLines(ink, w, h, dpi);
  if (opts.removeLeaders !== false) {
    const r = eraseLeadersAndSpecks(ink, w, h, dpi);
    stats.leaderDots = r.dots;
    stats.specks = r.specks;
    stats.barcodes = r.barcodes;
  }

  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = ink[i] ? 0 : 255;
  return { image: { width: w, height: h, data: out }, stats };
}

/**
 * Erases table borders and other long straight lines. Scans are never perfectly straight, so
 * a line is followed pixel by pixel and may drift sideways by one pixel every few steps and
 * jump small gaps. Letters are far shorter than the minimum length, so they are kept.
 */
function eraseLines(ink: Uint8Array, w: number, h: number, dpi: number): number {
  const minLen = Math.max(40, Math.round(dpi * 0.5));
  const half = Math.max(1, Math.round(dpi * 0.012));
  const erase = new Uint8Array(w * h);
  traceLines(ink, erase, w, h, minLen, half, true);
  traceLines(ink, erase, w, h, minLen, half, false);
  let n = 0;
  for (let i = 0; i < erase.length; i++) {
    if (erase[i] && ink[i]) {
      ink[i] = 0;
      n++;
    }
  }
  return n;
}

/**
 * Walks along every row (horizontal) or column (vertical). From each ink pixel it follows the
 * line forward: straight on if there is ink, else one pixel to the side (at most once every
 * 6 steps), else across a gap of up to 3 pixels. Paths of at least minLen are erased, together
 * with the ink within `half` pixels on each side (the line's thickness).
 */
function traceLines(
  ink: Uint8Array,
  erase: Uint8Array,
  w: number,
  h: number,
  minLen: number,
  half: number,
  horizontal: boolean,
) {
  // along = position on the line, across = row (horizontal) or column (vertical)
  const lenAlong = horizontal ? w : h;
  const lenAcross = horizontal ? h : w;
  const at = (along: number, across: number) =>
    horizontal ? across * w + along : along * w + across;
  const used = new Uint8Array(w * h);
  const path: number[] = [];

  for (let across = 0; across < lenAcross; across++) {
    for (let along = 0; along < lenAlong; along++) {
      const p0 = at(along, across);
      if (!ink[p0] || used[p0]) continue;
      path.length = 0;
      let a = along;
      let c = across;
      let sinceShift = 6;
      let gap = 0;
      while (a < lenAlong) {
        const p = at(a, c);
        if (ink[p]) {
          path.push(p);
          used[p] = 1;
          gap = 0;
        } else {
          let moved = false;
          if (sinceShift >= 6) {
            for (const d of [-1, 1]) {
              const cc = c + d;
              if (cc >= 0 && cc < lenAcross && ink[at(a, cc)]) {
                c = cc;
                sinceShift = 0;
                path.push(at(a, c));
                used[at(a, c)] = 1;
                moved = true;
                break;
              }
            }
          }
          if (!moved) {
            gap++;
            if (gap > 3) break;
          }
        }
        sinceShift++;
        a++;
      }
      if (path.length < minLen) continue;
      // Skip solid blocks (logos, filled boxes): a line has paper close by on both sides
      let solid = 0;
      for (let k = 0; k < path.length; k += 8) {
        const p = path[k];
        const pa = horizontal ? p % w : Math.floor(p / w);
        const pc = horizontal ? Math.floor(p / w) : p % w;
        const lo = pc - half * 3;
        const hi = pc + half * 3;
        if (lo >= 0 && hi < lenAcross && ink[at(pa, lo)] && ink[at(pa, hi)]) solid++;
      }
      if (solid / Math.ceil(path.length / 8) > 0.5) continue;
      for (const p of path) {
        const pa = horizontal ? p % w : Math.floor(p / w);
        const pc = horizontal ? Math.floor(p / w) : p % w;
        for (let d = -half; d <= half; d++) {
          const cc = pc + d;
          if (cc >= 0 && cc < lenAcross) erase[at(pa, cc)] = 1;
        }
      }
    }
  }
}

interface Blob {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
  pixels: number[];
}

/**
 * Finds small blobs. Rows of 6 or more evenly spaced dots (leaders) are erased, and so are
 * 1 to 2 pixel specks of scanner dust. Lone dots (decimal points, the dot on an i) stay.
 */
function eraseLeadersAndSpecks(ink: Uint8Array, w: number, h: number, dpi: number) {
  const dotMax = Math.max(3, Math.round(dpi * 0.035));
  const maxGap = Math.max(6, Math.round(dpi * 0.09));
  const speck = dpi >= 200 ? 2 : 0;
  const seen = new Uint8Array(w * h);
  const dots: Blob[] = [];
  const bars: Blob[] = [];
  const barMin = Math.round(dpi * 0.18);
  let specks = 0;
  const stack: number[] = [];

  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || seen[start]) continue;
    // Flood fill one 8-connected blob; give up early once it is too big to be a dot
    const blob: Blob = { minX: w, maxX: 0, minY: h, maxY: 0, area: 0, pixels: [] };
    let big = false;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      blob.area++;
      if (x < blob.minX) blob.minX = x;
      if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y;
      if (y > blob.maxY) blob.maxY = y;
      if (!big) {
        blob.pixels.push(p);
        if (blob.maxX - blob.minX >= dotMax || blob.maxY - blob.minY >= dotMax) {
          big = true;
          blob.pixels = [];
        }
      }
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (ink[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (big) {
      const bw = blob.maxX - blob.minX + 1;
      const bh = blob.maxY - blob.minY + 1;
      if (bh >= barMin && bw * 5 <= bh && blob.area >= bw * bh * 0.6) bars.push(blob);
      continue;
    }
    if (blob.area <= speck) {
      for (const p of blob.pixels) ink[p] = 0;
      specks++;
      continue;
    }
    dots.push(blob);
  }

  // Chain dots that sit on one line with a small gap between them
  const cy = dots.map((d) => (d.minY + d.maxY) / 2);
  const order = dots.map((_, i) => i).sort((a, b) => dots[a].minX - dots[b].minX);
  const parent = dots.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const buckets = new Map<number, number[]>();
  const tol = Math.max(2, Math.round(dotMax / 2));
  for (const i of order) {
    const b = Math.round(cy[i] / tol);
    for (const bb of [b - 1, b, b + 1]) {
      const list = buckets.get(bb);
      if (!list) continue;
      // The latest dot in this band that is close enough on the left
      for (let k = list.length - 1; k >= 0 && k >= list.length - 3; k--) {
        const j = list[k];
        const gap = dots[i].minX - dots[j].maxX;
        if (gap >= 1 && gap <= maxGap && Math.abs(cy[i] - cy[j]) <= tol) {
          parent[find(i)] = find(j);
        }
      }
    }
    const list = buckets.get(b) ?? [];
    list.push(i);
    buckets.set(b, list);
  }
  const size = new Map<number, number>();
  for (let i = 0; i < dots.length; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  let erased = 0;
  for (let i = 0; i < dots.length; i++) {
    if ((size.get(find(i)) ?? 0) >= 6) {
      for (const p of dots[i].pixels) ink[p] = 0;
      erased++;
    }
  }
  return { dots: erased, specks, barcodes: eraseBarcodes(ink, w, bars, dpi) };
}

/**
 * Barcodes: 10 or more tall, solid bars side by side with matching tops and bottoms. Tesseract
 * reads them as a run of letters that swallows the text next to them (the AIGS report number).
 */
function eraseBarcodes(ink: Uint8Array, w: number, bars: Blob[], dpi: number): number {
  const maxGap = Math.round(dpi * 0.06);
  const tol = Math.max(3, Math.round(dpi * 0.015));
  bars.sort((a, b) => a.minX - b.minX);
  const used = new Uint8Array(bars.length);
  let erased = 0;
  for (let i = 0; i < bars.length; i++) {
    if (used[i]) continue;
    const group = [i];
    let last = bars[i];
    for (let j = i + 1; j < bars.length; j++) {
      const b = bars[j];
      if (b.minX - last.maxX > maxGap) {
        if (b.minX - last.maxX > maxGap * 4) break;
        continue;
      }
      if (Math.abs(b.minY - bars[i].minY) <= tol && Math.abs(b.maxY - bars[i].maxY) <= tol) {
        group.push(j);
        last = b;
      }
    }
    if (group.length < 10) continue;
    for (const k of group) {
      used[k] = 1;
      const b = bars[k];
      for (let y = b.minY; y <= b.maxY; y++) ink.fill(0, y * w + b.minX, y * w + b.maxX + 1);
    }
    erased++;
  }
  return erased;
}

/** Rotates a grey image by a multiple of 90 degrees, clockwise. */
export function rotateGray(img: GrayImage, degrees: 0 | 90 | 180 | 270): GrayImage {
  if (degrees === 0) return img;
  const { width: w, height: h, data } = img;
  const turn = degrees === 180;
  const nw = turn ? w : h;
  const nh = turn ? h : w;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      if (degrees === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (degrees === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      out[ny * nw + nx] = data[y * w + x];
    }
  }
  return { width: nw, height: nh, data: out };
}

/** Nearest-neighbour-free box downscale, used for the quick orientation check. */
export function downscaleGray(img: GrayImage, maxSide: number): GrayImage {
  const { width: w, height: h, data } = img;
  const f = Math.ceil(Math.max(w, h) / maxSide);
  if (f <= 1) return img;
  const nw = Math.floor(w / f);
  const nh = Math.floor(h / f);
  const out = new Uint8Array(nw * nh);
  const area = f * f;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * w + x * f;
        for (let dx = 0; dx < f; dx++) s += data[row + dx];
      }
      out[y * nw + x] = Math.round(s / area);
    }
  }
  return { width: nw, height: nh, data: out };
}

/** A PGM file (P5) of the image: Tesseract reads it directly, no PNG encoder needed. */
export function toPgm(img: GrayImage): Uint8Array {
  const header = new TextEncoder().encode(`P5\n${img.width} ${img.height}\n255\n`);
  const out = new Uint8Array(header.length + img.data.length);
  out.set(header, 0);
  out.set(img.data, header.length);
  return out;
}

/**
 * For tick boxes: finds the box (the ink) inside the given area and returns the share of dark
 * pixels in its middle half. An empty box gives about 0, a ticked one clearly more.
 */
export function inkMeter(img: GrayImage) {
  const { width: w, height: h, data } = img;
  return (ax0: number, ay0: number, ax1: number, ay1: number): number => {
    const x0 = Math.max(0, Math.floor(ax0));
    const y0 = Math.max(0, Math.floor(ay0));
    const x1 = Math.min(w - 1, Math.ceil(ax1));
    const y1 = Math.min(h - 1, Math.ceil(ay1));
    let bx0 = x1;
    let by0 = y1;
    let bx1 = x0;
    let by1 = y0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (data[y * w + x] < 128) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    }
    if (bx1 - bx0 < 4 || by1 - by0 < 4) return 0;
    const qx = (bx1 - bx0) / 4;
    const qy = (by1 - by0) / 4;
    let dark = 0;
    let all = 0;
    for (let y = Math.round(by0 + qy); y <= Math.round(by1 - qy); y++) {
      for (let x = Math.round(bx0 + qx); x <= Math.round(bx1 - qx); x++) {
        all++;
        if (data[y * w + x] < 128) dark++;
      }
    }
    return all ? dark / all : 0;
  };
}
