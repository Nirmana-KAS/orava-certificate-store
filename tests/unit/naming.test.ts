import { describe, expect, it } from "vitest";

import { jpegSize, jpegToPdf, pdfName } from "@/lib/files/image-to-pdf";
import { detectKind, pdfRisks } from "@/lib/files/inspect";
import { baseNameOf, nameIsIncomplete, namePart, standardFileName } from "@/lib/files/naming";
import { latin1, risksIn } from "@/lib/files/pdf-patterns";
import { CATEGORY_LABELS, typeNameFor } from "@/lib/labs";

describe("standard file names", () => {
  it("puts report number, date and lab in that order", () => {
    expect(
      standardFileName({ reportNo: "B77215", reportDate: "2026-09-17", lab: "Bellerophon" }, "pdf"),
    ).toBe("B77215_2026-09-17_Bellerophon.pdf");
    expect(
      standardFileName(
        { reportNo: "GF26070746", reportDate: new Date("2026-07-15T00:00:00Z"), lab: "AIGS" },
        "pdf",
      ),
    ).toBe("GF26070746_2026-07-15_AIGS.pdf");
  });

  it("numbers extra files of the same certificate", () => {
    const parts = { reportNo: "C01092", reportDate: "2026-01-27", lab: "Bellerophon" };
    expect(standardFileName(parts, "pdf", 2)).toBe("C01092_2026-01-27_Bellerophon_2.pdf");
  });

  it("never lets a value break out of the name", () => {
    expect(namePart("../../etc/passwd", "x")).toBe("etc-passwd");
    expect(namePart("GF 2607/0746", "x")).toBe("GF-2607-0746");
    expect(namePart("Gübelin Lab", "x")).toBe("Gubelin-Lab");
    expect(namePart("  ", "NoLab")).toBe("NoLab");
  });

  it("marks missing parts", () => {
    const parts = { reportNo: null, reportDate: "bad", lab: "AIGS" };
    expect(standardFileName(parts, "pdf")).toBe("NoReportNo_NoDate_AIGS.pdf");
    expect(nameIsIncomplete(parts)).toBe(true);
    expect(nameIsIncomplete({ reportNo: "B1", reportDate: "2026-01-01", lab: "AIGS" })).toBe(false);
  });

  it("reads the name back from a storage path", () => {
    expect(baseNameOf("4f0c/B77215_2026-09-17_Bellerophon.pdf")).toBe(
      "B77215_2026-09-17_Bellerophon.pdf",
    );
  });
});

describe("type names", () => {
  it("uses the company's report names with the lab first", () => {
    expect(typeNameFor("AIGS", "individual")).toBe("AIGS Individual Gem Stone Report");
    expect(typeNameFor("Bellerophon", "lot")).toBe("Bellerophon Lot Wise Gem Stones Report");
    expect(CATEGORY_LABELS.lot).toBe("Lot Wise Gem Stones Report");
  });
});

/** A tiny but real baseline JPEG header (SOI, APP0, SOF0 with 3 x 2 px), then junk and EOI. */
function fakeJpeg(extra: number[] = []): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    0x00,
    0x02,
    0x00,
    0x03,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    ...extra,
    0xff,
    0xd9,
  ]);
}

describe("photos turned into PDF", () => {
  it("reads a JPEG's size", () => {
    expect(jpegSize(fakeJpeg())).toEqual({ width: 3, height: 2 });
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("writes a one-page PDF that passes the server's checks", () => {
    const pdf = jpegToPdf(fakeJpeg(), 3000, 2000);
    expect(detectKind(pdf)).toBe("pdf");
    expect(pdfRisks(pdf)).toEqual([]);
    const text = latin1(pdf);
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/MediaBox [0 0 842 561.33]");
    // Every xref offset points at its object
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + 7)).toBe(`${i + 1} 0 obj`));
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("notices image bytes that would look like a script to the server", () => {
    const risky = jpegToPdf(fakeJpeg([..."/JS ".split("").map((c) => c.charCodeAt(0))]), 3, 2);
    expect(risksIn(latin1(risky))).toEqual(["JavaScript"]);
    expect(pdfRisks(risky)).toEqual(["JavaScript"]);
  });

  it("names the PDF after the picked file", () => {
    expect(pdfName("IMG_2041.JPG")).toBe("IMG_2041.pdf");
    expect(pdfName("scan")).toBe("scan.pdf");
  });
});
