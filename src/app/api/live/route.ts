import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * A short fingerprint of everything the open pages show: this person's permissions and upload
 * mode, the certificates and their files, types, labs, staff and settings. Open tabs ask for it
 * every few seconds and reload their data when it changes, so an admin change shows up without
 * pressing refresh. Only a hash is sent, never the data itself. 401 means the sign-in has ended.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ signedIn: false }, { status: 401, headers: noStore });

  const [row] = await db()<{ v: string }[]>`
    select concat_ws('|',
      (select concat_ws(',', status, can_download, can_report, can_upload, upload_locked_at,
                        upload_passkey_set_at)
         from app_users where id = ${session.user.id}),
      (select (upload_until > now())::text from sessions where id = ${session.id}),
      (select concat_ws(',', count(*) filter (where deleted_at is null), max(updated_at))
         from certificates),
      (select concat_ws(',', count(*), max(created_at)) from certificate_files
         where status = 'ready'),
      (select max(updated_at)::text from certificate_types),
      (select max(updated_at)::text from labs),
      (select concat_ws(',', count(*), max(updated_at), max(last_login_at)) from app_users),
      (select updated_at::text from app_settings where id = true),
      -- Admins also see the System Map's problems (banner and bell)
      (select string_agg(component, ',' order by component) from incidents
         where status = 'open' and ${session.user.role === "admin"})
    ) as v
  `;
  const version = createHash("sha256")
    .update(row?.v ?? "")
    .digest("base64url")
    .slice(0, 16);
  return NextResponse.json({ signedIn: true, version }, { headers: noStore });
}
