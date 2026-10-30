import { describe, expect, it } from "vitest";

import { decide, LIMITS, minutesText, shouldAutoBlockIp } from "@/lib/server/rate-limit-policy";

const now = new Date("2026-10-30T10:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const none = { email15m: 0, email1h: 0, ip15m: 0, ip1h: 0, lastFailureAt: null };

describe("sign-in lockout rules", () => {
  it("allows a clean slate", () => {
    expect(decide(none, now)).toEqual({ allowed: true });
  });

  it("locks an email for 15 minutes after 5 failures", () => {
    const d = decide({ ...none, email15m: 5, email1h: 5, lastFailureAt: ago(1) }, now);
    expect(d).toMatchObject({ allowed: false, reason: "email_locked" });
    if (!d.allowed) expect(d.retryAfterSec).toBe(14 * 60);
  });

  it("unlocks once the lock time has passed", () => {
    expect(decide({ ...none, email15m: 5, email1h: 5, lastFailureAt: ago(16) }, now)).toEqual({
      allowed: true,
    });
  });

  it("locks for an hour after 10 failures", () => {
    const d = decide({ ...none, email15m: 2, email1h: 10, lastFailureAt: ago(20) }, now);
    expect(d).toMatchObject({ allowed: false, reason: "email_locked" });
  });

  it("throttles a noisy IP", () => {
    const d = decide({ ...none, ip15m: LIMITS.ipShort.failures, lastFailureAt: ago(2) }, now);
    expect(d).toMatchObject({ allowed: false, reason: "ip_throttled" });
  });

  it("auto-blocks an IP at 50 failures an hour", () => {
    expect(shouldAutoBlockIp(49)).toBe(false);
    expect(shouldAutoBlockIp(50)).toBe(true);
  });

  it("words the wait time", () => {
    expect(minutesText(30)).toBe("1 minute");
    expect(minutesText(14 * 60)).toBe("14 minutes");
  });
});
