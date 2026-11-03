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

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function png(tag: string): Buffer {
  // Extra bytes after the image end are ignored by viewers but make the file unique
  return Buffer.concat([Buffer.from(PNG_1x1, "base64"), Buffer.from(tag)]);
}

export function jpeg(tag: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]),
    Buffer.from(tag),
    Buffer.from([0xff, 0xd9]),
  ]);
}
