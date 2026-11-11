import "server-only";

import type { ActivityFilters } from "@/lib/activity";
import type { ClientMeta, DeviceGeo, GeoStatus } from "@/lib/client-info";

import { db } from "./db";

// Sign-in history: each sign-in (session) with when it started and ended, how long it lasted,
// where and on what it was, and everything done in it.

export type SessionEnd = "signed_out" | "ended_by_admin" | "expired" | "ended" | "active";

export type SessionRow = {
  id: string;
  email: string;
  role: "admin" | "viewer";
  started: Date;
  /** Sign-out time, or the last activity of a sign-in that ran out; now while still active */
  ended: Date;
  lastActive: Date;
  how: SessionEnd;
  seconds: number;
  ip: string | null;
  user_agent: string | null;
  client: ClientMeta | null;
  geo: DeviceGeo | null;
  geo_status: GeoStatus;
  actions: number;
};

export type SessionAction = {
  session_id: string;
  at: Date;
  action: string;
  target: string | null;
};

/**
 * One row per sign-in with its end and length worked out:
 * - signed out (or ended by the admin): ends when the sign-in was revoked
 * - still valid: running now
 * - ran out, or ended by a passkey change, lockdown or a disabled account: ends at the last
 *   thing the person did, so a sign-in left open overnight doesn't count as 8 hours of work
 */
function sessionsCte(f: Pick<ActivityFilters, "who" | "from" | "to">) {
  const sql = db();
  return sql`
    with base as (
      select s.id, u.email, s.role, s.created_at as started, s.revoked_at, s.ip, s.user_agent,
        s.client, s.geo, s.geo_status,
        greatest(s.last_seen_at, s.created_at,
          (select max(a.at) from audit_logs a where a.session_id = s.id)) as last_active,
        (select count(*)::int from audit_logs a where a.session_id = s.id) as actions,
        exists (select 1 from audit_logs a where a.session_id = s.id and a.action = 'sign_out')
          as signed_out,
        (s.revoked_at is null and s.expires_at > now() and u.status = 'active'
          and (s.role = 'admin'
               or (s.passkey_version = st.passkey_version and st.lockdown = false))) as valid,
        (s.revoked_at is null and s.expires_at <= now()) as expired
      from sessions s
      join app_users u on u.id = s.user_id
      cross join app_settings st
      where st.id = true
        ${f.who ? sql`and u.email = ${f.who}` : sql``}
        ${f.from ? sql`and s.created_at >= (${f.from}::date)::timestamp at time zone 'Asia/Colombo'` : sql``}
        ${f.to ? sql`and s.created_at < ((${f.to}::date) + 1)::timestamp at time zone 'Asia/Colombo'` : sql``}
    ),
    sessions_out as (
      select *,
        case
          when revoked_at is not null then revoked_at
          when valid then now()
          else last_active
        end as ended,
        case
          when revoked_at is not null and signed_out then 'signed_out'
          when revoked_at is not null then 'ended_by_admin'
          when valid then 'active'
          when expired then 'expired'
          else 'ended'
        end as how
      from base
    )
  `;
}

export async function findSessions(
  f: Pick<ActivityFilters, "who" | "from" | "to">,
  limit: number,
  offset: number,
): Promise<{ rows: SessionRow[]; total: number; seconds: number }> {
  const sql = db();
  const cte = sessionsCte(f);
  const [rows, [sum]] = await Promise.all([
    sql<SessionRow[]>`
      ${cte}
      select id::text, email, role, started, ended, last_active as "lastActive", how,
        greatest(0, extract(epoch from (ended - started)))::int as seconds,
        ip, user_agent, client, geo, geo_status, actions
      from sessions_out
      order by started desc
      limit ${limit} offset ${offset}
    `,
    sql<{ n: number; seconds: number }[]>`
      ${cte}
      select count(*)::int as n,
        coalesce(sum(greatest(0, extract(epoch from (ended - started)))), 0)::int as seconds
      from sessions_out
    `,
  ]);
  return { rows, total: sum?.n ?? 0, seconds: sum?.seconds ?? 0 };
}

/** What was done in each of these sign-ins, oldest first (at most 300 each). */
export async function sessionActions(ids: string[]): Promise<Map<string, SessionAction[]>> {
  const out = new Map<string, SessionAction[]>();
  if (ids.length === 0) return out;
  const rows = await db()<SessionAction[]>`
    select session_id::text, at, action, target from (
      select session_id, at, action, target,
        row_number() over (partition by session_id order by at) as n
      from audit_logs where session_id = any(${ids}::uuid[])
    ) x where n <= 300
    order by at
  `;
  for (const r of rows) {
    const list = out.get(r.session_id) ?? [];
    list.push(r);
    out.set(r.session_id, list);
  }
  return out;
}

/** Sign-ins and total time signed in per person over the last `days` days. */
export async function timeSignedIn(
  days: number,
): Promise<Map<string, { signIns: number; seconds: number }>> {
  const sql = db();
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await sql<{ email: string; n: number; seconds: number }[]>`
    ${sessionsCte({ from })}
    select email, count(*)::int as n,
      coalesce(sum(greatest(0, extract(epoch from (ended - started)))), 0)::int as seconds
    from sessions_out group by email
  `;
  return new Map(rows.map((r) => [r.email, { signIns: r.n, seconds: r.seconds }]));
}
