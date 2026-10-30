import "server-only";

import { cookies } from "next/headers";

import { COOKIES, cookieOptions } from "./cookies";
import { hmac, randomToken } from "./crypto";
import { db } from "./db";
import { env } from "./env";
import type { ClientInfo } from "./request";

const TRUST_DAYS = 30;

/** True when this browser already passed an email code for this user in the last 30 days. */
export async function isTrustedDevice(userId: string): Promise<boolean> {
  const token = (await cookies()).get(COOKIES.device)?.value;
  if (!token) return false;
  const rows = await db()`
    update trusted_devices set last_used_at = now()
    where token_hash = ${hmac(env().AUTH_SECRET, token)} and user_id = ${userId} and expires_at > now()
    returning id
  `;
  return rows.length > 0;
}

export async function trustThisDevice(userId: string, client: ClientInfo): Promise<void> {
  const token = randomToken();
  await db()`
    insert into trusted_devices (token_hash, user_id, user_agent, expires_at)
    values (${hmac(env().AUTH_SECRET, token)}, ${userId}, ${client.userAgent},
            now() + make_interval(days => ${TRUST_DAYS}))
  `;
  (await cookies()).set(COOKIES.device, token, cookieOptions(TRUST_DAYS * 86400));
}

export async function forgetUserDevices(userId: string): Promise<void> {
  await db()`delete from trusted_devices where user_id = ${userId}`;
}
