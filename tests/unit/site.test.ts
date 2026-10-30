import { describe, expect, it } from "vitest";

import { buildId, copyright, site } from "@/lib/site";

describe("site info", () => {
  it("has the company and developer details", () => {
    expect(site.company).toBe("orava (Pvt) Ltd.");
    expect(site.developer).toBe("Shehan Nirmana");
    expect(site.year).toBe(2026);
  });

  it("formats the copyright line", () => {
    expect(copyright()).toBe("© 2026 orava (Pvt) Ltd.");
  });

  it("shortens the commit id", () => {
    expect(buildId("a1b2c3d4e5f6")).toBe("a1b2c3d");
    expect(buildId("")).toBeNull();
  });
});
