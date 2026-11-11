import "server-only";

import type { ClientMeta, DeviceGeo, GeoStatus } from "@/lib/client-info";
import { containsPattern, kindPatterns, type ActivityFilters } from "@/lib/activity";

import { db } from "./db";

export type ActivityRow = {
  id: string;
  at: Date;
  actor_email: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: Record<string, unknown>;
  client: ClientMeta | null;
  session_id: string | null;
  /** The sign-in's exact device location, when it was shared */
  geo: DeviceGeo | null;
  geo_status: GeoStatus;
};

/** One page (or, for the CSV, up to `limit` rows) of the activity log, newest first. */
export async function findActivity(
  f: ActivityFilters,
  limit: number,
  offset = 0,
): Promise<{ rows: ActivityRow[]; total: number }> {
  const sql = db();
  const where = sql`
    where true
    ${f.who ? sql`and actor_email = ${f.who}` : sql``}
    ${f.kind ? sql`and action like any(${kindPatterns(f.kind)}::text[])` : sql``}
    ${f.from ? sql`and at >= (${f.from}::date)::timestamp at time zone 'Asia/Colombo'` : sql``}
    ${f.to ? sql`and at < ((${f.to}::date) + 1)::timestamp at time zone 'Asia/Colombo'` : sql``}
    ${
      f.q
        ? sql`and (coalesce(target, '') ilike ${containsPattern(f.q)}
              or coalesce(actor_email, '') ilike ${containsPattern(f.q)}
              or action ilike ${containsPattern(f.q)}
              or coalesce(ip, '') ilike ${containsPattern(f.q)})`
        : sql``
    }
  `;
  const [rows, [count]] = await Promise.all([
    sql<ActivityRow[]>`
      select id::text, at, actor_email, action, target, ip, user_agent, meta, client,
        session_id::text,
        (select geo from sessions s where s.id = audit_logs.session_id) as geo,
        (select geo_status from sessions s where s.id = audit_logs.session_id) as geo_status
      from audit_logs ${where}
      order by at desc, id desc
      limit ${limit} offset ${offset}
    `,
    sql<{ n: number }[]>`select count(*)::int as n from audit_logs ${where}`,
  ]);
  return { rows, total: count?.n ?? 0 };
}

/** Everyone who appears in the log, for the "Person" filter. */
export async function activityPeople(): Promise<string[]> {
  const rows = await db()<{ email: string }[]>`
    select distinct actor_email as email from audit_logs
    where actor_email is not null order by actor_email limit 500
  `;
  return rows.map((r) => r.email);
}
