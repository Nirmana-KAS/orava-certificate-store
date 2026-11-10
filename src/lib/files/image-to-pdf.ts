// Turns a scan or phone photo into a one-page PDF before it is uploaded, so every stored
// certificate is a PDF. The PDF is written by hand (one page, one JPEG image, nothing else), so it
// has no scripts, links or attachments and passes the server's PDF check.

import { latin1, risksIn } from "./pdf-patterns";

const A4_LONG_SIDE_PT = 842;
/** Longest side kept, in pixels: about 400 dpi on A4, plenty for reading and printing */
const MAX_SIDE_PX = 4700;
const JPEG_QUALITY = 0.9;

/** Width and height of a JPEG, read from its SOF marker. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (bytes[i + 5]! << 8) | bytes[i + 6]!,
        width: (bytes[i + 7]! << 8) | bytes[i + 8]!,
      };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * A minimal PDF with one page showing the JPEG. The page keeps the image's shape, with its long
 * side as long as A4's, so it prints at a normal size.
 */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const scale = A4_LONG_SIDE_PT / Math.max(width, height);
  const w = Math.round(width * scale * 100) / 100;
  const h = Math.round(height * scale * 100) / 100;
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === "string" ? enc.encode(p) : p;
    parts.push(b);
    length += b.length;
  };
  const obj = (n: number, body: string | (Uint8Array | string)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body.forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  obj(4, [
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  ]);
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const xref = length;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** "scan.jpg" → "scan.pdf" */
export function pdfName(name: string): string {
  return `${name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "certificate"}.pdf`;
}

/**
 * Browser only. Draws the image the right way up (phone photos carry their turn in EXIF), then
 * saves it as a one-page PDF.
 */
export async function imageFileToPdf(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    // A white page behind transparent PNG/WebP areas
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    // Image bytes can, very rarely, spell out something the server's PDF check refuses (such
    // as "/JS "). Saving at a slightly different quality gives completely different bytes.
    let pdf: Uint8Array | null = null;
    for (let q = JPEG_QUALITY; q > 0.8 && !pdf; q -= 0.01) {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q });
      const candidate = jpegToPdf(new Uint8Array(await blob.arrayBuffer()), width, height);
      if (risksIn(latin1(candidate)).length === 0) pdf = candidate;
    }
    if (!pdf) throw new Error("could not make a clean PDF");
    return new File([pdf as BlobPart], pdfName(file.name), {
      type: "application/pdf",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
