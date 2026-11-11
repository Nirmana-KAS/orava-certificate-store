import "server-only";

import { db } from "./db";

export type AppSettings = {
  passkeySet: boolean;
  passkeyHash: string | null;
  passkeyVersion: number;
  passkeyRotatedAt: Date | null;
  sessionHours: number;
  requireDeviceCode: boolean;
  lockdown: boolean;
  /** Days between backup reminders; 0 = never */
  backupRemindDays: number;
  backupRemindBanner: boolean;
  backupRemindEmail: boolean;
  /** When the admin last opened the Trash */
  trashSeenAt: Date | null;
};

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db()<
    {
      passkey_hash: string | null;
      passkey_version: number;
      passkey_rotated_at: Date | null;
      session_hours: number;
      require_device_code: boolean;
      lockdown: boolean;
      backup_remind_days: number;
      backup_remind_banner: boolean;
      backup_remind_email: boolean;
      trash_seen_at: Date | null;
    }[]
  >`
    select passkey_hash, passkey_version, passkey_rotated_at, session_hours, require_device_code, lockdown,
      backup_remind_days, backup_remind_banner, backup_remind_email, trash_seen_at
    from app_settings where id = true
  `;
  if (!row) throw new Error("app_settings row is missing. Run the database migrations.");
  return {
    passkeySet: !!row.passkey_hash,
    passkeyHash: row.passkey_hash,
    passkeyVersion: row.passkey_version,
    passkeyRotatedAt: row.passkey_rotated_at,
    sessionHours: row.session_hours,
    requireDeviceCode: row.require_device_code,
    lockdown: row.lockdown,
    backupRemindDays: row.backup_remind_days,
    backupRemindBanner: row.backup_remind_banner,
    backupRemindEmail: row.backup_remind_email,
    trashSeenAt: row.trash_seen_at,
  };
}
