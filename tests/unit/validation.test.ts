import { describe, expect, it } from "vitest";

import { newUserSchema, signInSchema, sixDigitCode } from "@/lib/validation";

describe("form validation", () => {
  it("normalises emails to lower case", () => {
    const r = signInSchema.parse({ email: "  Staff@Example.COM ", passkey: "x" });
    expect(r.email).toBe("staff@example.com");
  });

  it("rejects bad emails and empty passkeys", () => {
    expect(signInSchema.safeParse({ email: "nope", passkey: "" }).success).toBe(false);
  });

  it("accepts only six digits", () => {
    expect(sixDigitCode.safeParse("012345").success).toBe(true);
    expect(sixDigitCode.safeParse("12345").success).toBe(false);
    expect(sixDigitCode.safeParse("12a456").success).toBe(false);
  });

  it("turns an empty name into null", () => {
    expect(newUserSchema.parse({ email: "a@b.co", name: "", canDownload: true }).name).toBeNull();
  });
});
