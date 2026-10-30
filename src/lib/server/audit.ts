import "server-only";

import type postgres from "postgres";

import { db } from "./db";
import type { ClientInfo } from "./request";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

type Actor = { id: string; email: string } | null;

/** Records who did what. Never throws: logging must not break the action itself. */
export async function audit(
  actor: Actor,
  action: string,
  client: ClientInfo,
  target?: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db()`
      insert into audit_logs (actor_id, actor_email, action, target, ip, user_agent, meta)
      values (${actor?.id ?? null}, ${actor?.email ?? null}, ${action}, ${target ?? null},
              ${client.ip}, ${client.userAgent}, ${db().json(meta as postgres.JSONValue)})
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
