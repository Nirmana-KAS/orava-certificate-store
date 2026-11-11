import { describe, expect, it } from "vitest";

import { activityHref, containsPattern, kindPatterns, parseActivityFilters } from "@/lib/activity";

describe("activity log filters", () => {
  it("reads and cleans the address", () => {
    expect(
      parseActivityFilters({
        q: "  ruby ",
        who: "Staff@Example.com",
        kind: "files",
        from: "2026-11-10",
        to: "2026-11-01",
        page: "3",
      }),
    ).toEqual({
      q: "ruby",
      who: "staff@example.com",
      kind: "files",
      from: "2026-11-01",
      to: "2026-11-10",
      page: 3,
    });
  });

  it("ignores what it doesn't know", () => {
    expect(
      parseActivityFilters({ kind: "hack", from: "2026-13-45", to: "x", page: "-1", q: "" }),
    ).toEqual({
      page: 1,
      q: undefined,
      who: undefined,
      kind: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("builds the same address back, without page 1", () => {
    const f = parseActivityFilters({ who: "a@b.c", kind: "trash" });
    expect(activityHref("/admin/activity", f)).toBe("/admin/activity?who=a%40b.c&kind=trash");
    expect(activityHref("/admin/activity", f, { page: 2 })).toBe(
      "/admin/activity?who=a%40b.c&kind=trash&page=2",
    );
  });

  it("takes % and _ literally in searches", () => {
    expect(containsPattern("50%_off")).toBe("%50\\%\\_off%");
    expect(kindPatterns("types")).toEqual(["type.%", "lab.%"]);
    expect(kindPatterns("sign_in")).toEqual(["sign\\_in%", "sign\\_out%", "admin.%"]);
  });
});
