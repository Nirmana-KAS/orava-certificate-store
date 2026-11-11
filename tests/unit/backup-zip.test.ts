import { crc32 as nodeCrc32, deflateRawSync, inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { crc32, entryBytes, listZip, ZipLimitError, ZipWriter } from "@/lib/backup/zip";

async function build(
  files: { name: string; data: Uint8Array | string; compress?: boolean }[],
  deflate = true,
) {
  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter(
    (c) => void chunks.push(c),
    deflate ? async (d) => new Uint8Array(deflateRawSync(d)) : undefined,
  );
  for (const f of files) await zip.add(f.name, f.data, { compress: f.compress });
  await zip.finish();
  const out = Buffer.concat(chunks);
  expect(zip.size).toBe(out.length);
  return new Uint8Array(out);
}

describe("backup zip", () => {
  it("computes the same CRC-32 as zlib", () => {
    for (const s of ["", "a", "Orava Certificate Store", "x".repeat(10_000)]) {
      const b = new TextEncoder().encode(s);
      expect(crc32(b)).toBe(nodeCrc32(b));
    }
  });

  it("writes a zip that reads back: stored files and compressed JSON", async () => {
    const pdf = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
    const json = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i, name: "Ruby" })));
    const zip = await build([
      { name: "database/certificates.json", data: json, compress: true },
      { name: "files/abc/R-1_2026-01-01_AIGS.pdf", data: pdf },
      { name: "README.txt", data: "Ünïcode name ok" },
    ]);
    const entries = listZip(zip);
    expect(entries.map((e) => e.name)).toEqual([
      "database/certificates.json",
      "files/abc/R-1_2026-01-01_AIGS.pdf",
      "README.txt",
    ]);
    const [j, p, r] = entries;
    expect(j!.method).toBe(8);
    expect(Buffer.from(inflateRawSync(entryBytes(zip, j!))).toString()).toBe(json);
    expect(j!.crc).toBe(nodeCrc32(Buffer.from(json)));
    expect(p!.method).toBe(0);
    expect(Buffer.from(entryBytes(zip, p!))).toEqual(Buffer.from(pdf));
    expect(Buffer.from(entryBytes(zip, r!)).toString()).toBe("Ünïcode name ok");
  });

  it("stores text as it is when no compressor is available", async () => {
    const zip = await build([{ name: "a.json", data: "[1,2,3]", compress: true }], false);
    const [a] = listZip(zip);
    expect(a!.method).toBe(0);
    expect(Buffer.from(entryBytes(zip, a!)).toString()).toBe("[1,2,3]");
  });

  it("an empty zip is still valid", async () => {
    expect(listZip(await build([]))).toEqual([]);
  });

  it("refuses more files than a plain zip can hold", async () => {
    const zip = new ZipWriter(() => {});
    (zip as unknown as { entries: unknown[] }).entries.length = 0xffff;
    await expect(zip.add("x", "y")).rejects.toBeInstanceOf(ZipLimitError);
  });
});
