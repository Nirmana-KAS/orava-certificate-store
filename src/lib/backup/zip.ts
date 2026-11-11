// A small streaming zip writer for backups. It runs in the admin's browser (and in tests on
// Node): each file is written as soon as it is added, so a large backup never has to be held
// in memory twice. Plain zip (no Zip64), so one backup can be up to 4 GB, well above the
// 1 GB of free storage.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date and time in the old MS-DOS format that zip uses (local time, 2-second steps). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const MAX = 0xffffffff;
const MAX_ENTRIES = 0xffff;

export class ZipLimitError extends Error {}

type Entry = {
  name: Uint8Array;
  crc: number;
  packed: number;
  size: number;
  method: number;
  time: number;
  date: number;
  offset: number;
};

export type Deflate = (data: Uint8Array) => Promise<Uint8Array>;

export class ZipWriter {
  private entries: Entry[] = [];
  private offset = 0;
  private readonly encoder = new TextEncoder();

  /**
   * @param write receives the zip bytes in order
   * @param deflate optional raw-deflate compressor; without it every file is stored as is
   */
  constructor(
    private readonly write: (chunk: Uint8Array) => Promise<void> | void,
    private readonly deflate?: Deflate,
  ) {}

  /** Bytes written so far. */
  get size(): number {
    return this.offset;
  }

  private async emit(chunk: Uint8Array) {
    await this.write(chunk);
    this.offset += chunk.length;
  }

  /**
   * Adds one file. `compress` is worth it for text (JSON); PDFs and images are already
   * compressed, so they are stored as they are.
   */
  async add(
    path: string,
    data: Uint8Array | string,
    { compress = false, date = new Date() }: { compress?: boolean; date?: Date } = {},
  ): Promise<void> {
    const bytes = typeof data === "string" ? this.encoder.encode(data) : data;
    const name = this.encoder.encode(path.replace(/^\/+/, ""));
    if (this.entries.length >= MAX_ENTRIES) throw new ZipLimitError("Too many files for one zip");
    let body = bytes;
    let method = 0;
    if (compress && this.deflate && bytes.length > 0) {
      const packed = await this.deflate(bytes);
      if (packed.length < bytes.length) {
        body = packed;
        method = 8;
      }
    }
    if (this.offset + 30 + name.length + body.length > MAX || bytes.length > MAX) {
      throw new ZipLimitError("The backup is larger than 4 GB");
    }
    const { time, date: day } = dosDateTime(date);
    const crc = crc32(bytes);

    const head = new Uint8Array(30 + name.length);
    const v = new DataView(head.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // version needed
    v.setUint16(6, 0x0800, true); // UTF-8 names
    v.setUint16(8, method, true);
    v.setUint16(10, time, true);
    v.setUint16(12, day, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, body.length, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true);
    head.set(name, 30);

    const offset = this.offset;
    await this.emit(head);
    await this.emit(body);
    this.entries.push({
      name,
      crc,
      packed: body.length,
      size: bytes.length,
      method,
      time,
      date: day,
      offset,
    });
  }

  /** Writes the zip's table of contents. Nothing can be added after this. */
  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.name.length);
      const v = new DataView(rec.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true); // made by
      v.setUint16(6, 20, true); // needed
      v.setUint16(8, 0x0800, true);
      v.setUint16(10, e.method, true);
      v.setUint16(12, e.time, true);
      v.setUint16(14, e.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.packed, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      v.setUint32(42, e.offset, true);
      rec.set(e.name, 46);
      await this.emit(rec);
    }
    const dirSize = this.offset - start;
    if (this.offset + 22 > MAX) throw new ZipLimitError("The backup is larger than 4 GB");
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, dirSize, true);
    v.setUint32(16, start, true);
    await this.emit(end);
  }
}

/** Raw deflate with the browser's built-in CompressionStream, where it exists. */
export function browserDeflate(): Deflate | undefined {
  if (typeof CompressionStream === "undefined") return undefined;
  try {
    new CompressionStream("deflate-raw");
  } catch {
    return undefined;
  }
  return async (data) => {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
}

/** Reads a zip's table of contents back (used by the tests to check a backup). */
export function listZip(zip: Uint8Array): {
  name: string;
  method: number;
  crc: number;
  size: number;
  packed: number;
  offset: number;
}[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Not a zip file");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("Broken zip directory");
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    out.push({
      method: v.getUint16(p + 10, true),
      crc: v.getUint32(p + 16, true),
      packed: v.getUint32(p + 20, true),
      size: v.getUint32(p + 24, true),
      offset: v.getUint32(p + 42, true),
      name: dec.decode(zip.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

/** The stored (still packed) bytes of one entry. */
export function entryBytes(zip: Uint8Array, entry: { offset: number; packed: number }): Uint8Array {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const nameLen = v.getUint16(entry.offset + 26, true);
  const extra = v.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extra;
  return zip.subarray(start, start + entry.packed);
}
