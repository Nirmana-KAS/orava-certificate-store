// Pure lockout rules, kept separate so they can be unit tested.

export type FailureCounts = {
  email15m: number;
  email1h: number;
  ip15m: number;
  ip1h: number;
  /** Most recent failure for this email or IP */
  lastFailureAt: Date | null;
};

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "email_locked" | "ip_throttled"; retryAfterSec: number };

export const LIMITS = {
  emailShort: { failures: 5, lockMinutes: 15 },
  emailLong: { failures: 10, lockMinutes: 60 },
  ipShort: { failures: 20, lockMinutes: 15 },
  /** At this many failures in an hour the IP is blocked for a day */
  ipAutoBlock: { failures: 50, blockHours: 24 },
} as const;

export function decide(counts: FailureCounts, now = new Date()): LimitDecision {
  const sinceLast = counts.lastFailureAt
    ? Math.max(0, (now.getTime() - counts.lastFailureAt.getTime()) / 1000)
    : Infinity;

  const remaining = (minutes: number) => Math.max(1, Math.ceil(minutes * 60 - sinceLast));

  if (
    counts.email1h >= LIMITS.emailLong.failures &&
    sinceLast < LIMITS.emailLong.lockMinutes * 60
  ) {
    return {
      allowed: false,
      reason: "email_locked",
      retryAfterSec: remaining(LIMITS.emailLong.lockMinutes),
    };
  }
  if (
    counts.email15m >= LIMITS.emailShort.failures &&
    sinceLast < LIMITS.emailShort.lockMinutes * 60
  ) {
    return {
      allowed: false,
      reason: "email_locked",
      retryAfterSec: remaining(LIMITS.emailShort.lockMinutes),
    };
  }
  if (counts.ip15m >= LIMITS.ipShort.failures && sinceLast < LIMITS.ipShort.lockMinutes * 60) {
    return {
      allowed: false,
      reason: "ip_throttled",
      retryAfterSec: remaining(LIMITS.ipShort.lockMinutes),
    };
  }
  return { allowed: true };
}

export function shouldAutoBlockIp(ipFailures1h: number): boolean {
  return ipFailures1h >= LIMITS.ipAutoBlock.failures;
}

export function minutesText(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "1 minute" : `${minutes} minutes`;
}
