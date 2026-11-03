import { describe, expect, it } from "vitest";

import { detectKind, pdfRisks, sha256 } from "@/lib/files/inspect";
import { cleanFileName, formatBytes, isAllowedMime } from "@/lib/files/rules";

import { jpeg, pdf, pdfWithHiddenScript, png } from "../helpers/sample-files";

describe("what a file really is", () => {
  it("recognises PDF, JPEG, PNG and WebP by their first bytes", () => {
    expect(detectKind(pdf("a"))).toBe("pdf");
    expect(detectKind(jpeg("a"))).toBe("jpeg");
    expect(detectKind(png("a"))).toBe("png");
    expect(detectKind(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
  });

  it("does not trust names or claims: text, HTML and SVG are unknown", () => {
    expect(detectKind(Buffer.from("hello, I am not a PDF"))).toBeNull();
    expect(detectKind(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectKind(new Uint8Array())).toBeNull();
  });

  it("treats an image header as an image even if PDF text follows", () => {
    expect(detectKind(Buffer.concat([jpeg("x"), pdf("y")]))).toBe("jpeg");
  });
});

describe("PDF safety checks", () => {
  it("passes a plain PDF", () => {
    expect(pdfRisks(pdf("plain"))).toEqual([]);
  });

  it("finds scripts, launch actions, attachments and encryption", () => {
    expect(pdfRisks(pdf("x", "/OpenAction<</S/JavaScript/JS(app.alert(1))>>"))).toContain(
      "JavaScript",
    );
    expect(pdfRisks(pdf("x", "/OpenAction<</S/Launch/F(cmd.exe)>>"))).toContain("a launch action");
    expect(pdfRisks(pdf("x", "/Names<</EmbeddedFiles 5 0 R>>"))).toContain("an embedded file");
    expect(
      pdfRisks(Buffer.from(`${pdf("x").toString("latin1")}trailer<</Encrypt 9 0 R>>`, "latin1")),
    ).toContain("password protection");
  });

  it("sees through #xx name escapes", () => {
    expect(pdfRisks(pdf("x", "/OpenAction<</S/J#61vaScript>>"))).toContain("JavaScript");
  });

  it("unpacks compressed object streams to find hidden scripts", () => {
    expect(pdfRisks(pdfWithHiddenScript("x"))).toContain("JavaScript");
  });
});

describe("file rules", () => {
  it("allows only the four file types", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("image/webp")).toBe(true);
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("toString")).toBe(false);
  });

  it("cleans names for display", () => {
    expect(cleanFileName("C:\\Users\\me\\scan<1>.pdf")).toBe("scan1.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("")).toBe("file");
  });

  it("formats sizes and hashes", () => {
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
