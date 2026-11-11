import "server-only";

import { cookies } from "next/headers";
import type postgres from "postgres";

import { COOKIES } from "./cookies";
import { hmac } from "./crypto";
import { db } from "./db";
import { env } from "./env";
import type { ClientInfo } from "./request";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

/** sessionId: the sign-in this happened in, when the session cookie is already gone (sign-out) */
type Actor = { id: string; email: string; sessionId?: string } | null;

/** The current sign-in's token hash, from the session cookie. */
async function sessionTokenHash(): Promise<string | null> {
  try {
    const token = (await cookies()).get(COOKIES.session)?.value;
    return token ? hmac(env().AUTH_SECRET, token) : null;
  } catch {
    return null; // outside a request (scheduled job)
  }
}

const SIGN_INS = ["sign_in", "admin.sign_in", "admin.setup"];

/** Records who did what. Never throws: logging must not break the action itself. */
export async function audit(
  actor: Actor,
  action: string,
  client: ClientInfo,
  target?: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    const sql = db();
    const hash = actor?.sessionId ? null : await sessionTokenHash();
    // The sign-in itself was just created in this request, so its cookie may not be readable yet
    const session = actor?.sessionId
      ? sql`${actor.sessionId}::uuid`
      : SIGN_INS.includes(action) && actor
        ? sql`(select id from sessions where user_id = ${actor.id}
                 and created_at > now() - interval '2 minutes'
               order by created_at desc limit 1)`
        : hash
          ? sql`(select id from sessions where token_hash = ${hash})`
          : sql`null::uuid`;
    await sql`
      insert into audit_logs (actor_id, actor_email, action, target, ip, user_agent, meta, client,
                              session_id)
      values (${actor?.id ?? null}, ${actor?.email ?? null}, ${action}, ${target ?? null},
              ${client.ip}, ${client.userAgent}, ${sql.json(meta as postgres.JSONValue)},
              ${sql.json((client.meta ?? {}) as postgres.JSONValue)}, ${session})
    `;
  } catch (error) {
    console.error("audit log failed", error);
  }
}

export async function securityEvent(
  kind: string,
  severity: Severity,
  client: ClientInfo,
  email?: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db()`
      insert into security_events (kind, severity, ip, email, path, country, detail)
      values (${kind}, ${severity}, ${client.ip}, ${email ?? null}, ${client.path}, ${client.country},
              ${db().json(detail as postgres.JSONValue)})
    `;
  } catch (error) {
    console.error("security event failed", error);
  }
}
