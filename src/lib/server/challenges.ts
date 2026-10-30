import "server-only";

import { cookies } from "next/headers";

import { COOKIES, cookieOptions } from "./cookies";
import { hmac, numericCode, randomToken, safeEqual } from "./crypto";
import { db } from "./db";
import { env } from "./env";
import type { ClientInfo } from "./request";
import type { Role } from "./session";

export type ChallengeKind = "email_code" | "totp";

const TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

/** Starts the second sign-in step. Returns the emailed code for email_code challenges. */
export async function startChallenge(
  userId: string,
  kind: ChallengeKind,
  client: ClientInfo,
): Promise<{ code: string | null }> {
  const secret = env().AUTH_SECRET;
  const token = randomToken();
  const code = kind === "email_code" ? numericCode() : null;

  // Only one open challenge per user
  await db()`update login_challenges set consumed_at = now() where user_id = ${userId} and consumed_at is null`;
  await db()`
    insert into login_challenges (token_hash, user_id, kind, code_hash, ip, user_agent, expires_at)
    values (${hmac(secret, token)}, ${userId}, ${kind}, ${code ? hmac(secret, code) : null},
            ${client.ip}, ${client.userAgent}, now() + make_interval(mins => ${TTL_MINUTES}))
  `;
  (await cookies()).set(COOKIES.challenge, token, cookieOptions(TTL_MINUTES * 60));
  return { code };
}

export type PendingChallenge = {
  id: string;
  kind: ChallengeKind;
  attempts: number;
  user: { id: string; email: string; role: Role; status: string };
};

/** The open challenge for this browser, if any. */
export async function pendingChallenge(): Promise<PendingChallenge | null> {
  const token = (await cookies()).get(COOKIES.challenge)?.value;
  if (!token) return null;
  const [row] = await db()<
    {
      id: string;
      kind: ChallengeKind;
      attempts: number;
      user_id: string;
      email: string;
      role: Role;
      status: string;
    }[]
  >`
    select c.id, c.kind, c.attempts, u.id as user_id, u.email, u.role, u.status
    from login_challenges c join app_users u on u.id = c.user_id
    where c.token_hash = ${hmac(env().AUTH_SECRET, token)}
      and c.consumed_at is null and c.expires_at > now()
  `;
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    attempts: row.attempts,
    user: { id: row.user_id, email: row.email, role: row.role, status: row.status },
  };
}

/** Checks an emailed code. Each wrong guess counts; after 5 the challenge is closed. */
export async function checkEmailCode(challengeId: string, code: string): Promise<boolean> {
  const [row] = await db()<{ code_hash: string | null; attempts: number }[]>`
    update login_challenges set attempts = attempts + 1
    where id = ${challengeId} and consumed_at is null
    returning code_hash, attempts
  `;
  if (!row?.code_hash || row.attempts > MAX_CODE_ATTEMPTS) {
    await closeChallenge(challengeId);
    return false;
  }
  return safeEqual(row.code_hash, hmac(env().AUTH_SECRET, code.trim()));
}

export async function countAttempt(challengeId: string): Promise<number> {
  const [row] = await db()<{ attempts: number }[]>`
    update login_challenges set attempts = attempts + 1 where id = ${challengeId} returning attempts
  `;
  if ((row?.attempts ?? 0) >= MAX_CODE_ATTEMPTS) await closeChallenge(challengeId);
  return row?.attempts ?? MAX_CODE_ATTEMPTS;
}

export async function closeChallenge(challengeId: string): Promise<void> {
  await db()`update login_challenges set consumed_at = now() where id = ${challengeId}`;
}
