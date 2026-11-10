import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import { decodeNames, risksIn } from "./pdf-patterns";
import type { FileKind } from "./rules";

// Server-side checks on the bytes that were actually uploaded. The browser's claimed type and
// the file name are never trusted.

/** What the file really is, from its first bytes ("magic numbers"). */
export function detectKind(bytes: Uint8Array): FileKind | null {
  const b = bytes;
  const ascii = (start: number, text: string) =>
    text.split("").every((ch, i) => b[start + i] === ch.charCodeAt(0));

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(1, "PNG\r\n\u001a\n")) return "png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "webp";
  // A PDF may have a few junk bytes before its header; readers accept it within the first 1 KB
  if (Buffer.from(b.subarray(0, 1024)).toString("latin1").includes("%PDF-")) return "pdf";
  return null;
}

/**
 * Things a scanned certificate never needs and an attacker would use: scripts, launch actions,
 * attached files, media, XFA forms. Encrypted PDFs are refused too, because later steps (text
 * reading, watermarks) can't open them. Compressed object streams are unpacked and checked, since
 * that is where these entries can hide.
 */
export function pdfRisks(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const texts = [raw];

  let budget = 32 * 1024 * 1024; // stop unpacking after 32 MB in total (zip-bomb guard)
  const streamRe = /<<((?:(?!>>\s*stream)[\s\S]){0,4000})>>\s*stream\r?\n/g;
  for (let m = streamRe.exec(raw); m && budget > 0; m = streamRe.exec(raw)) {
    const dict = decodeNames(m[1] ?? "");
    if (!/\/ObjStm\b/.test(dict) || !/\/FlateDecode\b/.test(dict)) continue;
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      const out = inflateSync(Buffer.from(bytes.subarray(start, end)), {
        maxOutputLength: Math.min(budget, 8 * 1024 * 1024),
      });
      budget -= out.length;
      texts.push(out.toString("latin1"));
    } catch {
      // A damaged or oversized stream: skip it; the rest of the file is still checked
    }
  }

  return [...new Set(texts.flatMap(risksIn))];
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
