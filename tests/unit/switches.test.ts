import { describe, expect, it } from "vitest";

import {
  accessBlock,
  blockFor,
  chainOf,
  effectiveStates,
  needsConfirm,
  scheduleActive,
  scheduleSoon,
  sectionView,
  type ScheduleRow,
  type SwitchRow,
} from "@/lib/system/switches";

const now = new Date("2026-11-13T10:00:00Z");
const row = (r: Partial<SwitchRow> & Pick<SwitchRow, "section" | "state">): SwitchRow => ({
  message: null,
  until: null,
  includeAdmin: false,
  ...r,
});
const sched = (s: Partial<ScheduleRow>): ScheduleRow => ({
  id: "s1",
  section: "uploads",
  state: "hold",
  message: null,
  kind: "daily",
  days: [],
  startTime: "00:00",
  endTime: "02:00",
  startsAt: null,
  endsAt: null,
  tz: "Asia/Colombo",
  enabled: true,
  ...s,
});

describe("Control Center switches", () => {
  it("everything is on with no rows", () => {
    const eff = effectiveStates([], [], now);
    expect(blockFor("search", eff)).toBeNull();
    expect(blockFor("download", eff)).toBeNull();
  });

  it("a Hold on Database stops search, view and downloads but not email", () => {
    const eff = effectiveStates([row({ section: "database", state: "hold" })], [], now);
    expect(blockFor("search", eff)?.state).toBe("hold");
    expect(blockFor("view", eff)?.section).toBe("database");
    expect(blockFor("download", eff)?.state).toBe("hold");
    expect(blockFor("email", eff)).toBeNull();
    expect(sectionView("search", eff).view).toBe("affected");
    expect(sectionView("database", eff).view).toBe("hold");
  });

  it("Sign-in on Hold keeps the rest on", () => {
    const eff = effectiveStates([row({ section: "auth", state: "hold" })], [], now);
    expect(blockFor("signin", eff)?.state).toBe("hold");
    expect(blockFor("search", eff)).toBeNull();
  });

  it("read-only stops downloads and uploads, not search or view", () => {
    const eff = effectiveStates([row({ section: "system", state: "readonly" })], [], now);
    expect(blockFor("search", eff)).toBeNull();
    expect(blockFor("view", eff)).toBeNull();
    expect(blockFor("download", eff)?.state).toBe("readonly");
    expect(blockFor("upload", eff)?.state).toBe("readonly");
    expect(sectionView("downloads", eff).view).toBe("affected");
    expect(sectionView("search", eff).view).toBe("on");
  });

  it("the worst state wins", () => {
    const eff = effectiveStates(
      [row({ section: "system", state: "hold" }), row({ section: "storage", state: "down" })],
      [],
      now,
    );
    expect(blockFor("view", eff)?.state).toBe("down");
  });

  it("a switch whose back-on time has passed counts as on", () => {
    const eff = effectiveStates(
      [row({ section: "search", state: "hold", until: "2026-11-13T09:59:00Z" })],
      [],
      now,
    );
    expect(blockFor("search", eff)).toBeNull();
  });

  it("uses the switch's message, or a default", () => {
    const eff = effectiveStates(
      [row({ section: "search", state: "hold", message: "Back at noon" })],
      [],
      now,
    );
    expect(blockFor("search", eff)?.message).toBe("Back at noon");
    const eff2 = effectiveStates([row({ section: "search", state: "down" })], [], now);
    expect(blockFor("search", eff2)?.message).toMatch(/switched off/);
  });

  it("never stops the admin, unless the admin's own uploads were included", () => {
    const eff = effectiveStates([row({ section: "system", state: "down" })], [], now);
    expect(blockFor("search", eff, { admin: true })).toBeNull();
    expect(blockFor("upload", eff, { admin: true })).toBeNull();
    const eff2 = effectiveStates(
      [row({ section: "uploads", state: "hold", includeAdmin: true })],
      [],
      now,
    );
    expect(blockFor("upload", eff2, { admin: true })?.state).toBe("hold");
    expect(blockFor("search", eff2, { admin: true })).toBeNull();
  });

  it("chains include what a part needs and the whole-system switch", () => {
    expect(chainOf("downloads")).toEqual(
      expect.arrayContaining(["system", "downloads", "view", "storage", "database"]),
    );
    expect(chainOf("email")).toEqual(["email"]);
    expect(chainOf("extraction")).toContain("uploads");
  });

  it("asks for confirmation for Down and for the whole system", () => {
    expect(needsConfirm([{ section: "search", state: "hold" }])).toBe(false);
    expect(needsConfirm([{ section: "search", state: "down" }])).toBe(true);
    expect(needsConfirm([{ section: "system", state: "readonly" }])).toBe(true);
    expect(needsConfirm([{ section: "system", state: "on" }])).toBe(false);
  });
});

describe("maintenance windows", () => {
  // 00:00–02:00 Sri Lanka time (UTC+5:30) is 18:30–20:30 UTC the day before
  it("a nightly window is open at 01:00 Sri Lanka time", () => {
    expect(scheduleActive(sched({}), new Date("2026-11-12T19:30:00Z"))).toBe(true);
    expect(scheduleActive(sched({}), new Date("2026-11-12T21:00:00Z"))).toBe(false);
  });

  it("a window across midnight belongs to the day it starts", () => {
    // Fridays 23:00–01:00: open on Saturday 00:30 Sri Lanka time
    const s = sched({ kind: "weekly", days: [5], startTime: "23:00", endTime: "01:00" });
    expect(scheduleActive(s, new Date("2026-11-13T19:00:00Z"))).toBe(true); // Sat 00:30 LK
    expect(scheduleActive(s, new Date("2026-11-14T19:00:00Z"))).toBe(false); // Sun 00:30 LK
  });

  it("one-off windows, paused windows and the 15-minute warning", () => {
    const once = sched({
      kind: "once",
      startsAt: "2026-11-13T10:10:00Z",
      endsAt: "2026-11-13T11:00:00Z",
    });
    expect(scheduleActive(once, now)).toBe(false);
    expect(scheduleSoon(once, now)).toBe(true);
    expect(scheduleActive(once, new Date("2026-11-13T10:30:00Z"))).toBe(true);
    expect(scheduleActive({ ...once, enabled: false }, new Date("2026-11-13T10:30:00Z"))).toBe(
      false,
    );
  });

  it("an open window switches its part", () => {
    const s = sched({
      kind: "once",
      startsAt: "2026-11-13T09:00:00Z",
      endsAt: "2026-11-13T11:00:00Z",
    });
    const eff = effectiveStates([], [s], now);
    expect(eff.uploads.state).toBe("hold");
    expect(eff.uploads.source).toBe("schedule");
    expect(blockFor("extract", eff)?.section).toBe("uploads");
  });
});

describe("people, groups and types", () => {
  const rows = [
    {
      id: "1",
      scope: "user" as const,
      target: "u1",
      state: "hold" as const,
      message: null,
      until: null,
    },
    {
      id: "2",
      scope: "group" as const,
      target: "uploaders",
      state: "readonly" as const,
      message: null,
      until: null,
    },
    {
      id: "3",
      scope: "type" as const,
      target: "t1",
      state: "down" as const,
      message: null,
      until: null,
    },
  ];
  it("applies to the person, their group, or the type", () => {
    expect(accessBlock("search", rows, { userId: "u1" }, now)?.state).toBe("hold");
    expect(accessBlock("search", rows, { userId: "u2", canUpload: true }, now)).toBeNull();
    expect(accessBlock("download", rows, { userId: "u2", canUpload: true }, now)?.state).toBe(
      "readonly",
    );
    expect(accessBlock("view", rows, { typeId: "t1" }, now)?.state).toBe("down");
    expect(accessBlock("view", rows, { typeId: "t2" }, now)).toBeNull();
  });
  it("ends at the back-on time", () => {
    const timed = [{ ...rows[0]!, until: "2026-11-13T09:00:00Z" }];
    expect(accessBlock("search", timed, { userId: "u1" }, now)).toBeNull();
  });
});
