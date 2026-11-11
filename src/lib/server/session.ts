import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type postgres from "postgres";

import { COOKIES, cookieOptions } from "./cookies";
import { hmac, randomToken } from "./crypto";
import { db } from "./db";
import { env } from "./env";
import type { ClientInfo } from "./request";
import type { AppSettings } from "./settings";

export type Role = "admin" | "viewer";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  canDownload: boolean;
  /** May make reports from filtered lists (staff; the admin always may) */
  canReport: boolean;
  /**
   * An uploader: the admin allowed uploads and issued an upload passkey, and it isn't locked
   * after wrong tries. Uploading also needs upload mode to be unlocked (see uploadUntil).
   */
  canUpload: boolean;
  /** Upload mode is on until this time for this sign-in, or null */
  uploadUntil: Date | null;
};

/** Upload mode ends after this long without activity. */
export const UPLOAD_MODE_MINUTES = 30;

export type Session = { id: string; user: SessionUser };

const ADMIN_SESSION_HOURS = 8;

export async function createSession(
  user: { id: string; email: string; role: Role },
  client: ClientInfo,
  settings: AppSettings,
): Promise<void> {
  const token = randomToken();
  const hours =
    user.role === "admin"
      ? Math.min(ADMIN_SESSION_HOURS, settings.sessionHours)
      : settings.sessionHours;

  await db()`
    insert into sessions (token_hash, user_id, role, passkey_version, ip, user_agent, country, client,
                          expires_at)
    values (${hmac(env().AUTH_SECRET, token)}, ${user.id}, ${user.role},
            ${user.role === "viewer" ? settings.passkeyVersion : null},
            ${client.ip}, ${client.userAgent}, ${client.country},
            ${db().json((client.meta ?? {}) as postgres.JSONValue)},
            now() + make_interval(hours => ${hours}))
  `;
  await db()`update app_users set last_login_at = now() where id = ${user.id}`;

  const jar = await cookies();
  jar.set(COOKIES.session, token, cookieOptions(hours * 3600));
  jar.delete(COOKIES.challenge);
}

type Row = {
  session_id: string;
  last_seen_at: Date;
  id: string;
  email: string;
  name: string | null;
  role: Role;
  can_download: boolean;
  can_report: boolean;
  can_upload: boolean;
  upload_until: Date | null;
};

/**
 * The signed-in user for this request, or null. A session stops working when it expires, is revoked,
 * the user is disabled, the shared passkey is rotated (staff only), or lockdown is on (staff only).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIES.session)?.value;
  if (!token) return null;

  const [row] = await db()<Row[]>`
    select s.id as session_id, s.last_seen_at, u.id, u.email, u.name, u.role, u.can_download,
      u.can_report,
      (u.role = 'viewer' and u.can_upload and u.upload_passkey_hash is not null
        and u.upload_locked_at is null) as can_upload,
      case when s.upload_until > now() then s.upload_until end as upload_until
    from sessions s
    join app_users u on u.id = s.user_id
    cross join app_settings a
    where s.token_hash = ${hmac(env().AUTH_SECRET, token)}
      and s.revoked_at is null
      and s.expires_at > now()
      and u.status = 'active'
      and u.role = s.role
      and (s.role = 'admin' or (s.passkey_version = a.passkey_version and a.lockdown = false))
  `;
  if (!row) return null;

  if (Date.now() - row.last_seen_at.getTime() > 5 * 60 * 1000) {
    await db()`update sessions set last_seen_at = now() where id = ${row.session_id}`;
  }

  return {
    id: row.session_id,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      canDownload: row.can_download,
      canReport: row.can_report,
      canUpload: row.can_upload,
      uploadUntil: row.can_upload ? row.upload_until : null,
    },
  };
});

/** For pages any signed-in person may see. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

/** For admin pages. Staff are sent back to their own area. */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.user.role !== "admin") redirect("/certificates");
  return session;
}

/** Upload mode is on for this sign-in right now. */
export function inUploadMode(session: Session): boolean {
  return (
    session.user.role === "viewer" &&
    session.user.canUpload &&
    session.user.uploadUntil !== null &&
    session.user.uploadUntil.getTime() > Date.now()
  );
}

/** Where an editor's certificate pages live. */
export type EditorArea = "admin" | "upload";
export const certificatesBase = (area: EditorArea) =>
  area === "admin" ? "/admin/certificates" : "/upload/certificates";

/**
 * For adding, changing and deleting certificates: the admin, or an uploader whose upload mode is
 * unlocked on this sign-in. Each use keeps upload mode on for another 30 minutes. Everyone else
 * is sent away: staff to their certificates, an uploader whose mode ended to the unlock page.
 */
export async function requireEditor(): Promise<Session & { area: EditorArea }> {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.user.role === "admin") return { ...session, area: "admin" };
  if (!session.user.canUpload) redirect("/certificates");
  if (!inUploadMode(session)) redirect("/upload");
  const [row] = await db()<{ upload_until: Date }[]>`
    update sessions set upload_until = now() + make_interval(mins => ${UPLOAD_MODE_MINUTES})
    where id = ${session.id} and upload_until > now()
    returning upload_until
  `;
  if (!row) redirect("/upload");
  return { ...session, user: { ...session.user, uploadUntil: row.upload_until }, area: "upload" };
}

export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : "/certificates";
}

export async function endCurrentSession(): Promise<Session | null> {
  const session = await getSession();
  if (session) await db()`update sessions set revoked_at = now() where id = ${session.id}`;
  (await cookies()).delete(COOKIES.session);
  return session;
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const rows = await db()`
    update sessions set revoked_at = now()
    where user_id = ${userId} and revoked_at is null
    returning id
  `;
  return rows.length;
}

/** Signs out every staff member (admins stay signed in). */
export async function revokeAllViewerSessions(): Promise<number> {
  const rows = await db()`
    update sessions set revoked_at = now()
    where role = 'viewer' and revoked_at is null
    returning id
  `;
  return rows.length;
}

/** For the uploader's pages: an uploader in upload mode. The admin uses the admin pages. */
export async function requireUploadModePage(): Promise<Session> {
  const session = await requireEditor();
  if (session.area === "admin") redirect("/admin/certificates");
  return session;
}
