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
    }[]
  >`
    select passkey_hash, passkey_version, passkey_rotated_at, session_hours, require_device_code, lockdown
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
  };
}
