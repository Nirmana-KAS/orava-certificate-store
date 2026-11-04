import { describe, expect, it } from "vitest";

import {
  cleanForOcr,
  downscaleGray,
  inkMeter,
  otsuThreshold,
  rotateGray,
  toGray,
  toPgm,
  type GrayImage,
} from "@/lib/ocr/clean";

// A 300 dpi A4 page is about 2480 x 3508; a smaller page with the same proportions keeps the
// tests fast while the cleaner still thinks it is about 300 dpi.
const W = 2480;
const HT = 3508;

function blank(): GrayImage {
  return { width: W, height: HT, data: new Uint8Array(W * HT).fill(245) };
}
function rect(img: GrayImage, x0: number, y0: number, x1: number, y1: number, v = 20) {
  for (let y = y0; y < y1; y++) img.data.fill(v, y * img.width + x0, y * img.width + x1);
}
const inkIn = (img: GrayImage, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) if (img.data[y * img.width + x] < 128) n++;
  return n;
};

describe("cleaning a scan before reading it", () => {
  const img = blank();
  // A slightly slanted table border (1 pixel drop every 100), 3 px thick, 1500 px long
  for (let x = 300; x < 1800; x++) {
    const y = 500 + Math.floor((x - 300) / 100);
    rect(img, x, y, x + 1, y + 3);
  }
  // A letter-sized block (like an "l"): must stay
  rect(img, 400, 700, 408, 745);
  // Dotted leader: 30 dots, 5 px wide, 9 px apart
  for (let i = 0; i < 30; i++) rect(img, 600 + i * 14, 900, 605 + i * 14, 905);
  // A lone decimal point: must stay
  rect(img, 1500, 900, 1505, 905);
  // A barcode: 14 bars, 70 px tall
  for (let i = 0; i < 14; i++) rect(img, 1000 + i * 12, 1200, 1000 + i * 12 + (i % 3) + 3, 1270);

  const { image, stats } = cleanForOcr(img);

  it("removes the border, leader dots and barcode, and keeps letters and decimal points", () => {
    expect(inkIn(image, 300, 495, 1800, 520)).toBe(0);
    expect(inkIn(image, 400, 700, 408, 745)).toBe(8 * 45);
    expect(inkIn(image, 590, 895, 1030, 910)).toBe(0);
    expect(inkIn(image, 1500, 900, 1505, 905)).toBe(25);
    expect(inkIn(image, 990, 1195, 1200, 1275)).toBe(0);
    expect(stats.barcodes).toBe(1);
    expect(stats.leaderDots).toBe(30);
  });

  it("measures tick boxes", () => {
    const box = blank();
    // Empty box and ticked box, 40 px with a 3 px border
    for (const x of [200, 400]) {
      rect(box, x, 200, x + 40, 203);
      rect(box, x, 237, x + 40, 240);
      rect(box, x, 200, x + 3, 240);
      rect(box, x + 37, 200, x + 40, 240);
    }
    rect(box, 410, 210, 430, 230); // the tick
    const ink = inkMeter(box);
    expect(ink(190, 190, 250, 250)).toBeLessThan(0.02);
    expect(ink(390, 190, 450, 250)).toBeGreaterThan(0.3);
  });
});

describe("image helpers", () => {
  it("rotates by quarter turns", () => {
    const img: GrayImage = { width: 3, height: 2, data: Uint8Array.from([1, 2, 3, 4, 5, 6]) };
    expect(Array.from(rotateGray(img, 90).data)).toEqual([4, 1, 5, 2, 6, 3]);
    expect(rotateGray(img, 90)).toMatchObject({ width: 2, height: 3 });
    expect(Array.from(rotateGray(img, 180).data)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(Array.from(rotateGray(rotateGray(img, 90), 270).data)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("converts, thresholds, shrinks and encodes", () => {
    const rgba = Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]);
    expect(Array.from(toGray(rgba, 3, 1).data)).toEqual([255, 0, 255]);
    const two = Uint8Array.from([...Array(50).fill(30), ...Array(50).fill(220)]);
    const t = otsuThreshold(two);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
    expect(downscaleGray(blank(), 1000).width).toBeLessThanOrEqual(1000);
    const pgm = toPgm({ width: 2, height: 1, data: Uint8Array.from([0, 255]) });
    expect(new TextDecoder().decode(pgm.slice(0, 11))).toBe("P5\n2 1\n255\n");
  });
});
