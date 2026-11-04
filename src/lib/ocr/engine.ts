// Reads a certificate file in the admin's browser: PDF pages are drawn with pdf.js, images are
// decoded by the browser, then each page is turned upright, cleaned and read with Tesseract.
// Everything runs on the admin's device; the file is never sent anywhere to be read.
// Browser only: import this from client components.

import type { Worker as TesseractWorker } from "tesseract.js";

import {
  cleanForOcr,
  downscaleGray,
  estimateDpi,
  inkMeter,
  rotateGray,
  toGray,
  toPgm,
  type GrayImage,
} from "./clean";
import type { OcrPage, OcrWord } from "./layout";

export type ReadStage = "starting" | "opening" | "turning" | "reading" | "rereading";

export interface ReadProgress {
  stage: ReadStage;
  page: number;
  pages: number;
  /** 0 to 1 within the stage */
  progress: number;
}

export interface ReadResult {
  pages: OcrPage[];
  /** Degrees each page was turned (clockwise) to read it upright */
  rotations: number[];
  /** Mean OCR confidence, 0 to 100 */
  confidence: number;
  ms: number;
  /** Reads the same pages again with a lighter ink threshold, for fields that came out doubtful */
  reread: (onProgress?: (p: ReadProgress) => void) => Promise<OcrPage[]>;
}

/** Most pages a PDF is read for; certificates are one or two pages. */
export const MAX_PAGES = 3;
/** Long side in pixels to read at: about 300 dpi for A4. */
const TARGET_LONG_SIDE = 3500;
const MIN_LONG_SIDE = 2400;

let workerPromise: Promise<TesseractWorker> | null = null;
let listener: ((progress: number) => void) | null = null;

async function worker(): Promise<TesseractWorker> {
  workerPromise ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    const w = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/core",
      langPath: "/ocr/lang",
      gzip: true,
      workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") listener?.(m.progress);
      },
    });
    await w.setParameters({ preserve_interword_spaces: "1" });
    return w;
  })().catch((e: unknown) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

/** Frees the OCR engine's memory, e.g. when the admin leaves the page. */
export async function stopReader() {
  const w = workerPromise;
  workerPromise = null;
  if (w) await (await w).terminate();
}

function canvasOf(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't draw images.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  return { c, ctx };
}

const scaleFor = (w: number, h: number) => {
  const long = Math.max(w, h);
  if (long > TARGET_LONG_SIDE) return TARGET_LONG_SIDE / long;
  if (long < MIN_LONG_SIDE) return Math.min(2, MIN_LONG_SIDE / long);
  return 1;
};

async function imagePages(file: Blob): Promise<GrayImage[]> {
  // "from-image" applies the phone camera's EXIF rotation
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = scaleFor(bmp.width, bmp.height);
  const w = Math.round(bmp.width * s);
  const h = Math.round(bmp.height * s);
  const { ctx } = canvasOf(w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return [toGray(ctx.getImageData(0, 0, w, h).data, w, h)];
}

async function pdfPages(file: Blob): Promise<GrayImage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    enableXfa: false,
  });
  const doc = await task.promise;
  try {
    const out: GrayImage[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // About 300 dpi for an A4 page, whatever size the PDF says it is
      const vp = page.getViewport({
        scale: Math.min(6, TARGET_LONG_SIDE / Math.max(base.width, base.height)),
      });
      const { c, ctx } = canvasOf(Math.round(vp.width), Math.round(vp.height));
      await page.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
      out.push(toGray(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height));
      page.cleanup();
    }
    return out;
  } finally {
    await task.destroy();
  }
}

/** Number of real words Tesseract is sure about: the upright page has by far the most. */
function goodWords(words: OcrWord[]): number {
  return words.filter((w) => w.conf > 70 && /^[A-Za-z]{3,}$/.test(w.text)).length;
}

async function recognize(img: GrayImage, onProgress?: (p: number) => void): Promise<OcrWord[]> {
  const w = await worker();
  listener = onProgress ?? null;
  try {
    await w.setParameters({
      user_defined_dpi: String(Math.round(estimateDpi(img.width, img.height))),
    });
    const r = await w.recognize(toPgm(img) as unknown as Blob, {}, { text: false, blocks: true });
    const words: OcrWord[] = [];
    for (const b of r.data.blocks ?? []) {
      for (const p of b.paragraphs) {
        for (const l of p.lines) {
          for (const x of l.words) {
            words.push({
              text: x.text,
              conf: Math.round(x.confidence),
              x0: x.bbox.x0,
              y0: x.bbox.y0,
              x1: x.bbox.x1,
              y1: x.bbox.y1,
            });
          }
        }
      }
    }
    return words;
  } finally {
    listener = null;
  }
}

/** Tries the page small at 0, 90, 270 and 180 degrees and keeps the way that reads best. */
async function uprightAngle(img: GrayImage): Promise<0 | 90 | 180 | 270> {
  const small = cleanForOcr(downscaleGray(img, 1400), { removeLeaders: false }).image;
  let best: { angle: 0 | 90 | 180 | 270; score: number } = { angle: 0, score: -1 };
  for (const angle of [0, 270, 90, 180] as const) {
    const score = goodWords(await recognize(rotateGray(small, angle)));
    if (score > best.score) best = { angle, score };
    // An upright page has plenty of clear words; no need to try the other ways
    if (angle === 0 && score >= 20) break;
  }
  return best.angle;
}

function pageOf(img: GrayImage, words: OcrWord[]): OcrPage {
  return { width: img.width, height: img.height, words, ink: inkMeter(img) };
}

/** Reads a PDF or image file and returns the words on each page with their positions. */
export async function readFile(
  file: Blob,
  onProgress?: (p: ReadProgress) => void,
): Promise<ReadResult> {
  const started = performance.now();
  onProgress?.({ stage: "starting", page: 0, pages: 0, progress: 0 });
  await worker();
  onProgress?.({ stage: "opening", page: 0, pages: 0, progress: 0 });
  const isPdf = file.type === "application/pdf";
  const grays = isPdf ? await pdfPages(file) : await imagePages(file);

  const upright: GrayImage[] = [];
  const rotations: number[] = [];
  const pages: OcrPage[] = [];
  for (let i = 0; i < grays.length; i++) {
    onProgress?.({ stage: "turning", page: i + 1, pages: grays.length, progress: 0 });
    const angle = await uprightAngle(grays[i]);
    const img = rotateGray(grays[i], angle);
    grays[i] = img;
    upright.push(img);
    rotations.push(angle);
    const clean = cleanForOcr(img).image;
    const words = await recognize(clean, (progress) =>
      onProgress?.({ stage: "reading", page: i + 1, pages: grays.length, progress }),
    );
    pages.push(pageOf(clean, words));
  }

  let again: Promise<OcrPage[]> | null = null;
  const all = pages.flatMap((p) => p.words);
  const confidence = all.length ? Math.round(all.reduce((a, w) => a + w.conf, 0) / all.length) : 0;

  return {
    pages,
    rotations,
    confidence,
    ms: Math.round(performance.now() - started),
    reread: (cb) => {
      // Done once per file, however many times it is asked for (e.g. the type is changed)
      again ??= (async () => {
        const out: OcrPage[] = [];
        for (let i = 0; i < upright.length; i++) {
          const clean = cleanForOcr(upright[i], { thresholdBoost: -12 }).image;
          const words = await recognize(clean, (progress) =>
            cb?.({ stage: "rereading", page: i + 1, pages: upright.length, progress }),
          );
          out.push(pageOf(clean, words));
        }
        return out;
      })();
      return again;
    },
  };
}
