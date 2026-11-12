import { describe, expect, it } from "vitest";

import {
  COMPONENTS,
  COMPONENT_BY_ID,
  CONNECTIONS,
  connectionStatus,
  mapStatuses,
  worst,
  type ComponentResult,
  type Status,
} from "@/lib/system/map";

const r = (status: Status): ComponentResult => ({ status, summary: "", checks: [] });

describe("system map", () => {
  it("every connection joins two known parts, and every part has a unique place", () => {
    for (const c of CONNECTIONS) {
      expect(COMPONENT_BY_ID[c.from]).toBeDefined();
      expect(COMPONENT_BY_ID[c.to]).toBeDefined();
      // Samples never carry a real secret
      expect(c.sample).not.toMatch(/eyJ[A-Za-z0-9]/);
    }
    const spots = COMPONENTS.map((c) => c.at.join(","));
    expect(new Set(spots).size).toBe(spots.length);
    for (const c of COMPONENTS) for (const n of c.needs) expect(COMPONENT_BY_ID[n]).toBeDefined();
  });

  it("finds the worst status", () => {
    expect(worst([])).toBe("ok");
    expect(worst(["ok", "off", "warn"])).toBe("warn");
    expect(worst(["warn", "fail", "unknown"])).toBe("fail");
    expect(worst(["ok", "unknown"])).toBe("unknown");
  });

  it("marks parts that fail only because a part they need failed", () => {
    const s = mapStatuses({ app: r("fail"), gate: r("fail"), reader: r("ok"), database: r("ok") });
    expect(s.app).toBe("fail");
    expect(s.gate).toBe("affected");
    expect(s.reader).toBe("ok");
    expect(s.storage).toBe("unknown");
  });

  it("colours a connection by the worse end", () => {
    const s = mapStatuses({
      app: r("ok"),
      database: r("fail"),
      storage: r("warn"),
      geocoder: r("off"),
    });
    const by = (id: string) => CONNECTIONS.find((c) => c.id === id)!;
    expect(connectionStatus(by("app-database"), s)).toBe("fail");
    expect(connectionStatus(by("app-storage"), s)).toBe("warn");
    expect(connectionStatus(by("app-geocoder"), s)).toBe("off");
  });
});
