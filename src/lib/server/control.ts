import "server-only";

import { audit, securityEvent } from "./audit";
import { hmac, randomToken } from "./crypto";
import { db } from "./db";
import { env } from "./env";
import { verifySecret } from "./password";
import type { ClientInfo } from "./request";
import type { Session } from "./session";
import { alertAdmin, invalidateSwitches } from "./switches";

// The Control Center's own lock: a second passkey, separate from the admin password, the
// authenticator and the staff passkey. A correct one opens the page for 10 minutes on this
// sign-in. Wrong ones count toward a lockout, and 3 in a row email a rescue link.

export const UNLOCK_MINUTES = 10;
export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;
export const RESCUE_AFTER = 3;
export const RESCUE_MINUTES = 15;

export type ControlSettings = {
  passkeySet: boolean;
  passkeyHash: string | null;
  failedTries: number;
  lockedUntil: Date | null;
  /** Minutes left of a lockout, or 0 */
  lockedMinutes: number;
};

export async function controlSettings(): Promise<ControlSettings> {
  const [row] = await db()<
    { passkey_hash: string | null; failed_tries: number; locked_until: Date | null }[]
  >`select passkey_hash, failed_tries, locked_until from control_settings where id = true`;
  return {
    passkeySet: !!row?.passkey_hash,
    passkeyHash: row?.passkey_hash ?? null,
    failedTries: row?.failed_tries ?? 0,
    lockedUntil: row?.locked_until && row.locked_until > new Date() ? row.locked_until : null,
    lockedMinutes:
      row?.locked_until && row.locked_until > new Date()
        ? Math.max(1, Math.ceil((row.locked_until.getTime() - Date.now()) / 60_000))
        : 0,
  };
}

/** When the Control Center unlock ends for this sign-in, or null when it is locked. */
export async function controlUnlockedUntil(session: Session): Promise<Date | null> {
  if (session.user.role !== "admin") return null;
  const [row] = await db()<{ control_until: Date | null }[]>`
    select control_until from sessions where id = ${session.id} and control_until > now()
  `;
  return row?.control_until ?? null;
}

export async function unlockControl(session: Session): Promise<void> {
  await db()`
    update sessions set control_until = now() + make_interval(mins => ${UNLOCK_MINUTES})
    where id = ${session.id}
  `;
}

export async function lockControl(session: Session): Promise<void> {
  await db()`update sessions set control_until = null where id = ${session.id}`;
}

export type CheckResult = { ok: true } | { ok: false; error: string };

/**
 * Checks a typed Control passkey. Wrong tries are counted in the database (so they hold across
 * devices), raise a security event, lock the page for 15 minutes after 5, and email a rescue
 * link after 3 in a row.
 */
export async function checkControlPasskey(
  session: Session,
  typed: string,
  client: ClientInfo,
  origin: string | null,
): Promise<CheckResult> {
  const s = await controlSettings();
  if (!s.passkeySet) return { ok: false, error: "Set a Control passkey first." };
  if (s.lockedUntil) {
    const mins = Math.max(1, Math.ceil((s.lockedUntil.getTime() - Date.now()) / 60_000));
    return {
      ok: false,
      error: `Too many wrong passkeys. Try again in ${mins} min, or use the rescue link in your email.`,
    };
  }
  if (await verifySecret(s.passkeyHash, typed)) {
    if (s.failedTries) {
      await db()`update control_settings set failed_tries = 0, updated_at = now() where id = true`;
    }
    return { ok: true };
  }

  const [row] = await db()<{ failed_tries: number }[]>`
    update control_settings set failed_tries = failed_tries + 1,
      locked_until = case when failed_tries + 1 >= ${MAX_TRIES}
                          then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end,
      updated_at = now()
    where id = true
    returning failed_tries
  `;
  const tries = row?.failed_tries ?? MAX_TRIES;
  const actor = { id: session.user.id, email: session.user.email };
  await securityEvent(
    "control_passkey_failed",
    tries >= MAX_TRIES ? "critical" : tries >= RESCUE_AFTER ? "high" : "medium",
    client,
    session.user.email,
    { tries },
  );
  await audit(actor, "control.unlock_failed", client, null, { tries });
  if (tries === RESCUE_AFTER) {
    await sendRescueLink(`${RESCUE_AFTER} wrong Control passkeys in a row`, client, origin);
  }
  if (tries >= MAX_TRIES) {
    await alertAdmin("Control Center locked", [
      `The Control Center was locked for ${LOCK_MINUTES} minutes after ${tries} wrong Control passkeys.`,
      `Network: ${client.ip ?? "unknown"}${client.country ? ` (${client.country})` : ""}.`,
      "If this wasn't you, change your admin password now.",
    ]);
    return {
      ok: false,
      error: `Too many wrong passkeys. The Control Center is locked for ${LOCK_MINUTES} minutes. A rescue link was emailed to you.`,
    };
  }
  const left = MAX_TRIES - tries;
  return {
    ok: false,
    error: `That Control passkey isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`,
  };
}

// ── Rescue link ───────────────────────────────────────────────────────────────────

/**
 * Emails a signed, single-use link valid for 15 minutes. Opening it (after admin sign-in) turns
 * everything back on and asks for a new Control passkey. Older unused links stop working.
 */
export async function sendRescueLink(
  reason: string,
  client: ClientInfo,
  origin: string | null,
): Promise<void> {
  const token = randomToken();
  const sql = db();
  await sql`update control_rescue_links set used_at = now() where used_at is null`;
  await sql`
    insert into control_rescue_links (token_hash, reason, expires_at)
    values (${hmac(env().AUTH_SECRET, `rescue:${token}`)}, ${reason},
            now() + make_interval(mins => ${RESCUE_MINUTES}))
  `;
  const base = env().NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || origin?.replace(/\/$/, "") || "";
  await audit(null, "control.rescue_sent", client, null, { reason });
  await alertAdmin("emergency switch-on link", [
    `Reason: ${reason}.`,
    "",
    "This link turns every switch back on and asks you to set a new Control passkey.",
    `It works once, for ${RESCUE_MINUTES} minutes, after you sign in as admin:`,
    `${base}/admin/control/rescue?t=${token}`,
    "",
    "If you didn't ask for this, someone may be trying to get into the Control Center.",
  ]);
}

export type RescueCheck = "ok" | "used" | "expired" | "invalid";

export async function checkRescueToken(token: string): Promise<RescueCheck> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return "invalid";
  const [row] = await db()<{ used: boolean; expired: boolean }[]>`
    select used_at is not null as used, expires_at <= now() as expired
    from control_rescue_links where token_hash = ${hmac(env().AUTH_SECRET, `rescue:${token}`)}
  `;
  if (!row) return "invalid";
  if (row.used) return "used";
  if (row.expired) return "expired";
  return "ok";
}

/**
 * Uses a rescue link: every section on, every user/group/type switch removed, every schedule
 * paused, and the Control passkey cleared so a new one must be set. Returns false if the link
 * can't be used (already used, too old, or wrong).
 */
export async function applyRescueToken(token: string, session: Session, client: ClientInfo) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false;
  const sql = db();
  const used = await sql.begin(async (tx) => {
    const [link] = await tx`
      update control_rescue_links set used_at = now()
      where token_hash = ${hmac(env().AUTH_SECRET, `rescue:${token}`)}
        and used_at is null and expires_at > now()
      returning id
    `;
    if (!link) return false;
    await tx`
      update system_switches set state = 'on', message = null, until = null,
        include_admin = false, reason = 'Rescue link', changed_by = ${session.user.email},
        changed_at = now()
      where state <> 'on'
    `;
    await tx`delete from access_switches`;
    await tx`update switch_schedules set enabled = false where enabled`;
    await tx`
      update control_settings set passkey_hash = null, passkey_set_at = null, failed_tries = 0,
        locked_until = null, updated_at = now()
      where id = true
    `;
    await tx`update sessions set control_until = null where control_until is not null`;
    return true;
  });
  if (!used) return false;
  invalidateSwitches();
  await audit(
    { id: session.user.id, email: session.user.email },
    "control.rescue_used",
    client,
    "Everything on",
  );
  await alertAdmin("everything switched back on by rescue link", [
    "A rescue link was used: every switch is on, user/group/type switches were removed and schedules were paused.",
    "Set a new Control passkey on the Control Center page.",
    `Network: ${client.ip ?? "unknown"}${client.country ? ` (${client.country})` : ""}.`,
  ]);
  return true;
}
