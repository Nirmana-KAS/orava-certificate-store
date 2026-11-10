import { deflateSync } from "node:zlib";

// Tiny real files for tests, made unique with `tag` so duplicate checks don't clash.

export function pdf(tag: string, extra = ""): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R${extra}>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n% ${tag}\n`,
    "latin1",
  );
}

/** A PDF whose script is hidden inside a compressed object stream */
export function pdfWithHiddenScript(tag: string): Buffer {
  const packed = deflateSync(Buffer.from("3 0 <</S/JavaScript/JS(app.alert(1))>>", "latin1"));
  return Buffer.concat([
    Buffer.from(
      `%PDF-1.5\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n4 0 obj<</Type/ObjStm/N 1/First 4/Filter/FlateDecode/Length ${packed.length}>>stream\n`,
      "latin1",
    ),
    packed,
    Buffer.from(`\nendstream\nendobj\n%%EOF\n% ${tag}\n`, "latin1"),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * A real 24 x 16 PNG whose pixels depend on `tag`, so two tags give different pictures (and so
 * different PDFs once the browser turns the picture into one).
 */
export function png(tag: string): Buffer {
  const w = 24;
  const h = 16;
  const seed = [...tag].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rows: number[] = [];
  for (let y = 0; y < h; y++) {
    rows.push(0);
    for (let x = 0; x < w; x++) {
      const v = (seed >>> ((x + y) % 24)) & 0xff;
      rows.push(v, (v * 7 + x * 9) & 0xff, (v * 13 + y * 11) & 0xff);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function jpeg(tag: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]),
    Buffer.from(tag),
    Buffer.from([0xff, 0xd9]),
  ]);
}
