import "server-only";

import { securityEvent } from "./audit";
import { db } from "./db";
import { decide, LIMITS, shouldAutoBlockIp, type LimitDecision } from "./rate-limit-policy";
import type { ClientInfo } from "./request";

export type AttemptKind = "passkey" | "admin_password" | "email_code" | "totp" | "setup";

export async function isIpBlocked(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const rows = await db()`
    select 1 from ip_blocks
    where ip = ${ip} and (expires_at is null or expires_at > now())
    limit 1
  `;
  return rows.length > 0;
}

export async function checkLimit(client: ClientInfo, email: string | null): Promise<LimitDecision> {
  const [row] = await db()<
    {
      email15m: number;
      email1h: number;
      ip15m: number;
      ip1h: number;
      last_failure_at: Date | null;
    }[]
  >`
    select
      count(*) filter (where email = ${email} and at > now() - interval '15 minutes')::int as email15m,
      count(*) filter (where email = ${email})::int                                       as email1h,
      count(*) filter (where ip = ${client.ip} and at > now() - interval '15 minutes')::int as ip15m,
      count(*) filter (where ip = ${client.ip})::int                                      as ip1h,
      max(at) as last_failure_at
    from login_attempts
    where success = false
      and at > now() - interval '1 hour'
      and (email = ${email} or ip = ${client.ip})
  `;
  return decide({
    email15m: row?.email15m ?? 0,
    email1h: row?.email1h ?? 0,
    ip15m: row?.ip15m ?? 0,
    ip1h: row?.ip1h ?? 0,
    lastFailureAt: row?.last_failure_at ?? null,
  });
}

/** Records an attempt. Failed ones may lock the email, and very many from one IP block it for a day. */
export async function recordAttempt(
  client: ClientInfo,
  email: string | null,
  kind: AttemptKind,
  success: boolean,
): Promise<void> {
  await db()`
    insert into login_attempts (ip, email, kind, success)
    values (${client.ip}, ${email}, ${kind}, ${success})
  `;
  if (success || !client.ip) return;

  const [row] = await db()<{ failures: number }[]>`
    select count(*)::int as failures from login_attempts
    where ip = ${client.ip} and success = false and at > now() - interval '1 hour'
  `;
  const failures = row?.failures ?? 0;
  if (shouldAutoBlockIp(failures) && !(await isIpBlocked(client.ip))) {
    await db()`
      insert into ip_blocks (ip, reason, expires_at)
      values (${client.ip}, ${"Automatic: too many failed sign-ins"},
              now() + make_interval(hours => ${LIMITS.ipAutoBlock.blockHours}))
    `;
    await securityEvent("ip_auto_blocked", "high", client, email, { failures });
  } else if (failures === LIMITS.ipShort.failures) {
    await securityEvent("brute_force_suspected", "medium", client, email, { failures, kind });
  }
}
