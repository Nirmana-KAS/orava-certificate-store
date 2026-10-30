import { describe, expect, it } from "vitest";

import { decrypt, encrypt, hmac, numericCode, randomToken, safeEqual } from "@/lib/server/crypto";

const secret = "unit-test-secret-0123456789abcdefghijkl";

describe("crypto helpers", () => {
  it("round-trips encrypted values and rejects tampering", () => {
    const sealed = encrypt(secret, "JBSWY3DPEHPK3PXP");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decrypt(secret, sealed)).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decrypt("another-secret-0123456789abcdefghijkl", sealed)).toThrow();
    const [iv, tag, data] = sealed.split(".");
    expect(() => decrypt(secret, [iv, tag, `${data}A`].join("."))).toThrow();
  });

  it("makes six-digit codes with leading zeros kept", () => {
    for (let i = 0; i < 200; i++) expect(numericCode()).toMatch(/^\d{6}$/);
  });

  it("makes long unique tokens", () => {
    const a = randomToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).not.toBe(randomToken());
  });

  it("hashes with a key and compares safely", () => {
    expect(hmac(secret, "x")).toBe(hmac(secret, "x"));
    expect(hmac(secret, "x")).not.toBe(hmac(`${secret}!`, "x"));
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
