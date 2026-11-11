import { describe, expect, it } from "vitest";

import { metaDetails } from "@/lib/activity";
import { describeDevice, describePlace, isLocalIp } from "@/lib/client-info";
import { colName, sheetNames, xlsxParts } from "@/lib/xlsx";

const WIN_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15";
const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

describe("describeDevice", () => {
  it("names the browser with its version, and Windows 11 from the system version", () => {
    expect(describeDevice(WIN_CHROME, { platformVersion: "15.0.0" })).toEqual({
      browser: "Chrome 157",
      system: "Windows 11",
      device: "Computer",
    });
    expect(describeDevice(WIN_CHROME, { platformVersion: "10.0.0" }).system).toBe("Windows 10");
    expect(describeDevice(WIN_CHROME).system).toBe("Windows 10 or 11");
    expect(describeDevice(EDGE).browser).toBe("Edge 157");
    expect(describeDevice(FIREFOX)).toEqual({
      browser: "Firefox 140",
      system: "Linux",
      device: "Computer",
    });
    expect(describeDevice(WIN_CHROME, { brand: "Brave" }).browser).toBe("Brave 157");
  });

  it("reads phones: the real Android version and model when the browser shares them", () => {
    expect(describeDevice(ANDROID_CHROME)).toEqual({
      browser: "Chrome 157",
      system: "Android",
      device: "Phone",
    });
    expect(
      describeDevice(ANDROID_CHROME, { platformVersion: "14.0.0", model: "SM-S918B" }),
    ).toEqual({ browser: "Chrome 157", system: "Android 14", device: "Phone (SM-S918B)" });
    expect(describeDevice(IPHONE)).toEqual({
      browser: "Safari 18.1",
      system: "iOS 18.1",
      device: "iPhone",
    });
    expect(describeDevice(MAC_SAFARI).system).toBe("macOS");
    expect(describeDevice(MAC_SAFARI, { platformVersion: "15.2.0" }).system).toBe("macOS 15");
  });

  it("says so when nothing was recorded", () => {
    expect(describeDevice(null)).toEqual({
      browser: "Not recorded",
      system: "Not recorded",
      device: "Not recorded",
    });
  });
});

describe("describePlace", () => {
  it("gives the town and country with a Google Maps pin", () => {
    const p = describePlace("112.134.140.96", {
      city: "Colombo",
      country: "LK",
      lat: 6.9271,
      lon: 79.8612,
    });
    expect(p.text).toBe("Colombo, Sri Lanka");
    expect(p.mapUrl).toBe("https://www.google.com/maps/search/?api=1&query=6.9271%2C79.8612");
  });

  it("searches by name without coordinates, and explains local or missing places", () => {
    expect(describePlace("1.2.3.4", { country: "LK" }).mapUrl).toContain("query=Sri%20Lanka");
    expect(describePlace("::1", {}).text).toBe("This computer or office network");
    expect(describePlace("8.8.8.8", null)).toEqual({
      text: "Not recorded",
      mapUrl: null,
      known: false,
    });
    expect(isLocalIp("192.168.1.25")).toBe(true);
    expect(isLocalIp("172.20.0.1")).toBe(true);
    expect(isLocalIp("172.40.0.1")).toBe(false);
  });
});

describe("metaDetails", () => {
  it("turns saved details into plain labels and values, leaving out ids", () => {
    expect(
      metaDetails({
        rows: 180,
        bytes: 1420995,
        withFiles: true,
        certificate: "0b8f4c1e-1111-4a2b-9c3d-123456789abc",
        filters: { who: "a@b.com", kind: "trash", page: undefined },
      }),
    ).toEqual([
      { label: "Database rows", value: "180" },
      { label: "Size", value: "1.4 MB" },
      { label: "Files included", value: "Yes" },
      { label: "Filters", value: "Person a@b.com, Kind trash" },
    ]);
  });
});

describe("xlsx", () => {
  it("names columns past Z and keeps sheet names valid and unique", () => {
    expect([colName(0), colName(25), colName(26), colName(27), colName(701), colName(702)]).toEqual(
      ["A", "Z", "AA", "AB", "ZZ", "AAA"],
    );
    expect(sheetNames(["A/B: [x]", "Same", "same", "x".repeat(40)])).toEqual([
      "A B x",
      "Same",
      "same (2)",
      "x".repeat(31),
    ]);
  });

  it("writes one worksheet per sheet, with text escaped and a filter on the header", () => {
    const parts = xlsxParts([
      {
        name: "Certificates",
        rows: [{ cells: ["Report", "Carats"], bold: true }, { cells: ["A<1>&", 1.5] }],
        freezeRows: 1,
        filterRow: 1,
      },
      { name: "Staff", rows: [{ cells: ["x"] }] },
    ]);
    const names = parts.map((p) => p.name);
    expect(names).toContain("xl/worksheets/sheet2.xml");
    const sheet = parts.find((p) => p.name === "xl/worksheets/sheet1.xml")!.data;
    expect(sheet).toContain("A&lt;1&gt;&amp;");
    expect(sheet).toContain("<v>1.5</v>");
    expect(sheet).toContain('<autoFilter ref="A1:B2"/>');
    expect(parts.find((p) => p.name === "xl/workbook.xml")!.data).toContain('name="Staff"');
  });
});
