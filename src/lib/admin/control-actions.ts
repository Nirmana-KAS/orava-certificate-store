"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type postgres from "postgres";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import {
  checkControlPasskey,
  controlSettings,
  controlUnlockedUntil,
  lockControl,
  sendRescueLink,
  unlockControl,
  applyRescueToken,
} from "@/lib/server/control";
import { siteOrigin } from "@/lib/server/cron-auth";
import { db } from "@/lib/server/db";
import { hashSecret, verifySecret } from "@/lib/server/password";
import { clientInfo, type ClientInfo } from "@/lib/server/request";
import { requireAdmin, revokeAllViewerSessions, type Session } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { alertAdmin, invalidateSwitches } from "@/lib/server/switches";
import {
  BUILT_IN_PRESETS,
  GROUP_LABEL,
  needsConfirm,
  SECTION_BY_ID,
  SECTION_IDS,
  STATE_LABEL,
  type AccessGroup,
  type PresetStates,
  type SectionId,
  type SwitchState,
} from "@/lib/system/switches";
import type { FormState } from "@/lib/validation";

const PAGE = "/admin/control";

export type ActionResult =
  | { ok: true; message: string; undoId?: string | null }
  | { ok: false; error: string; locked?: boolean; needConfirm?: boolean };

const LOCKED_TEXT =
  "The Control Center locked itself after 10 minutes. Unlock it again with your Control passkey.";
const LOCKED: ActionResult = { ok: false, locked: true, error: LOCKED_TEXT };

async function origin(): Promise<string | null> {
  return siteOrigin(await headers());
}

/** The admin, with the Control Center unlocked on this sign-in. */
async function control(): Promise<{ session: Session; client: ClientInfo } | null> {
  const session = await requireAdmin();
  if (!(await controlUnlockedUntil(session))) return null;
  return { session, client: await clientInfo() };
}

const actorOf = (s: Session) => ({ id: s.user.id, email: s.user.email });

// ── Control passkey ───────────────────────────────────────────────────────────────

const newPasskey = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Use at most 200 characters.");

/** A Control passkey must not be the admin password or the staff passkey. */
async function reused(session: Session, value: string): Promise<boolean> {
  const [cred] = await db()<{ password_hash: string }[]>`
    select password_hash from admin_credentials where user_id = ${session.user.id}
  `;
  const settings = await getSettings();
  return (
    (await verifySecret(cred?.password_hash, value)) ||
    (await verifySecret(settings.passkeyHash, value))
  );
}

export async function setControlPasskeyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const current = await controlSettings();
  const client = await clientInfo();
  // Changing an existing passkey needs the old one (or the rescue link, which clears it)
  if (current.passkeySet) {
    if (!(await controlUnlockedUntil(session))) return { error: LOCKED_TEXT };
    const check = await checkControlPasskey(
      session,
      String(formData.get("current") ?? ""),
      client,
      await origin(),
    );
    if (!check.ok) return { fields: { current: check.error } };
  }
  const parsed = newPasskey.safeParse(formData.get("passkey"));
  if (!parsed.success) return { fields: { passkey: parsed.error.issues[0]!.message } };
  if (parsed.data !== formData.get("repeat")) {
    return { fields: { repeat: "The two passkeys don't match." } };
  }
  if (await reused(session, parsed.data)) {
    return {
      fields: {
        passkey: "Use a different passkey from your admin password and the staff passkey.",
      },
    };
  }
  await db()`
    update control_settings set passkey_hash = ${await hashSecret(parsed.data)},
      passkey_set_at = now(), failed_tries = 0, locked_until = null, updated_at = now()
    where id = true
  `;
  await unlockControl(session);
  await audit(
    actorOf(session),
    current.passkeySet ? "control.passkey_changed" : "control.passkey_set",
    client,
  );
  await alertAdmin(current.passkeySet ? "Control passkey changed" : "Control passkey set", [
    `The Control Center passkey was ${current.passkeySet ? "changed" : "set"} by ${session.user.email}.`,
    `Network: ${client.ip ?? "unknown"}${client.country ? ` (${client.country})` : ""}.`,
    "If this wasn't you, use Send rescue link on the Control Center page and change your admin password.",
  ]);
  redirect(PAGE);
}

export async function unlockControlAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const client = await clientInfo();
  const typed = String(formData.get("passkey") ?? "");
  if (!typed) return { fields: { passkey: "Enter your Control passkey." } };
  const check = await checkControlPasskey(session, typed, client, await origin());
  if (!check.ok) return { error: check.error };
  await unlockControl(session);
  await audit(actorOf(session), "control.unlock", client);
  redirect(PAGE);
}

export async function lockControlAction(): Promise<void> {
  const session = await requireAdmin();
  await lockControl(session);
  redirect(PAGE);
}

/** Emails a rescue link. Works while the page is locked: it is the way back in. */
export async function sendRescueAction(): Promise<ActionResult> {
  await requireAdmin();
  const [recent] = await db()<{ n: number }[]>`
    select count(*)::int as n from control_rescue_links where created_at > now() - interval '2 minutes'
  `;
  if (recent?.n) {
    return {
      ok: false,
      error: "A rescue link was sent less than 2 minutes ago. Check your email.",
    };
  }
  await sendRescueLink("Asked for on the Control Center page", await clientInfo(), await origin());
  return { ok: true, message: "Rescue link sent. It works once, for 15 minutes." };
}

export async function rescueEverythingAction(token: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const done = await applyRescueToken(String(token), session, await clientInfo());
  if (!done) {
    return {
      ok: false,
      error:
        "This rescue link can't be used: it was used already, is older than 15 minutes, or isn't complete.",
    };
  }
  revalidatePath("/", "layout");
  redirect(`${PAGE}?rescued=1`);
}

// ── Switching sections ────────────────────────────────────────────────────────────

type Snapshot = {
  state: SwitchState;
  message: string | null;
  until: string | null;
  includeAdmin: boolean;
};

type Change = { section: SectionId; to: Snapshot };

const reasonInput = z
  .string()
  .trim()
  .min(3, "Write a short reason (it goes in the change log).")
  .max(300);
const messageInput = z.string().trim().max(500).nullable().optional();
const untilInput = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()
  .refine((v) => !v || new Date(v).getTime() > Date.now(), "The back-on time has already passed.")
  .refine(
    (v) => !v || new Date(v).getTime() < Date.now() + 31 * 86_400_000,
    "Pick a back-on time within 30 days.",
  );
const confirmInput = z.object({
  passkey: z.string().max(200).optional(),
  confirm: z.string().max(20).optional(),
});

/** Big actions need the Control passkey again plus the word CONFIRM. */
async function confirmed(
  session: Session,
  input: { passkey?: string; confirm?: string },
  client: ClientInfo,
): Promise<ActionResult | null> {
  if ((input.confirm ?? "").trim() !== "CONFIRM") {
    return { ok: false, needConfirm: true, error: "Type CONFIRM to go ahead." };
  }
  const check = await checkControlPasskey(session, input.passkey ?? "", client, await origin());
  if (!check.ok) return { ok: false, needConfirm: true, error: check.error };
  return null;
}

/** Saves the changes, logs them with what they were before, signs staff out when needed. */
async function applyChanges(
  session: Session,
  client: ClientInfo,
  changes: Change[],
  reason: string,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<{ undoId: string | null; summary: string; signedOut: number }> {
  const sql = db();
  const before = await sql.begin(async (tx) => {
    const rows = await tx<
      {
        section: SectionId;
        state: SwitchState;
        message: string | null;
        until: Date | null;
        include_admin: boolean;
      }[]
    >`
      select section, state, message, until, include_admin from system_switches
      where section = any(${changes.map((c) => c.section)}::text[])
      for update
    `;
    for (const c of changes) {
      await tx`
        update system_switches set state = ${c.to.state}, message = ${c.to.message},
          until = ${c.to.until}, include_admin = ${c.to.includeAdmin}, reason = ${reason},
          changed_by = ${session.user.email}, changed_at = now()
        where section = ${c.section}
      `;
    }
    return rows;
  });
  invalidateSwitches();

  const from = Object.fromEntries(
    before.map((r) => [
      r.section,
      {
        state: r.state,
        message: r.message,
        until: r.until ? new Date(r.until).toISOString() : null,
        includeAdmin: r.include_admin,
      } satisfies Snapshot,
    ]),
  );
  const logged = changes
    .map((c) => ({ section: c.section, from: from[c.section], to: c.to }))
    .filter(
      (c) =>
        !c.from ||
        c.from.state !== c.to.state ||
        c.from.message !== c.to.message ||
        c.from.until !== c.to.until ||
        c.from.includeAdmin !== c.to.includeAdmin,
    );

  // Down on Sign-in or on everything ends every staff sign-in straight away
  const endsSessions = changes.some(
    (c) =>
      c.to.state === "down" &&
      (c.section === "auth" || c.section === "system") &&
      from[c.section]?.state !== "down",
  );
  const signedOut = endsSessions ? await revokeAllViewerSessions() : 0;

  const summary = logged.length
    ? logged
        .map(
          (c) =>
            `${SECTION_BY_ID[c.section].name}: ${STATE_LABEL[c.from?.state ?? "on"]} → ${STATE_LABEL[c.to.state]}`,
        )
        .join(", ")
    : "No change";
  const undoId = logged.length
    ? await audit(actorOf(session), action, client, summary, {
        changes: logged,
        reason,
        signedOut,
        ...extra,
      })
    : null;
  if (logged.length) {
    await alertAdmin(`switched: ${summary}`, [
      `${session.user.email} changed the Control Center switches:`,
      ...logged.map(
        (c) =>
          `• ${SECTION_BY_ID[c.section].name}: ${STATE_LABEL[c.from?.state ?? "on"]} → ${STATE_LABEL[c.to.state]}${c.to.until ? ` (back on ${new Date(c.to.until).toISOString()})` : ""}`,
      ),
      `Reason: ${reason}`,
      signedOut ? `${signedOut} staff sign-ins were ended.` : "",
      `Network: ${client.ip ?? "unknown"}${client.country ? ` (${client.country})` : ""}.`,
    ]);
  }
  revalidatePath("/", "layout");
  return { undoId, summary, signedOut };
}

const switchInput = z
  .object({
    section: z.enum(SECTION_IDS as [SectionId, ...SectionId[]]),
    state: z.enum(["on", "readonly", "hold", "down"]),
    message: messageInput,
    until: untilInput,
    includeAdmin: z.boolean().optional(),
    reason: reasonInput,
  })
  .and(confirmInput);

export async function setSwitchAction(input: unknown): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  const parsed = switchInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;
  const section = SECTION_BY_ID[v.section];
  if (!section.states.includes(v.state)) {
    return { ok: false, error: `${section.name} can't be set to ${STATE_LABEL[v.state]}.` };
  }
  if (needsConfirm([{ section: v.section, state: v.state }])) {
    const refused = await confirmed(ctx.session, v, ctx.client);
    if (refused) return refused;
  }
  const on = v.state === "on";
  const r = await applyChanges(
    ctx.session,
    ctx.client,
    [
      {
        section: v.section,
        to: {
          state: v.state,
          message: on ? null : v.message || null,
          until: on ? null : (v.until ?? null),
          includeAdmin: !on && !!section.adminOption && !!v.includeAdmin,
        },
      },
    ],
    v.reason,
    "control.switch",
  );
  return {
    ok: true,
    message: r.summary + (r.signedOut ? `. ${r.signedOut} staff sign-ins were ended.` : ""),
    undoId: r.undoId,
  };
}

const presetInput = z
  .object({ preset: z.string().min(1).max(100), reason: reasonInput })
  .and(confirmInput);

/** Applies a preset: its sections get its states, every other section is switched on. */
export async function applyPresetAction(input: unknown): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  const parsed = presetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;
  let name: string;
  let states: PresetStates;
  const built = BUILT_IN_PRESETS.find((p) => p.key === v.preset);
  if (built) {
    name = built.name;
    states = built.states;
  } else {
    if (!z.uuid().safeParse(v.preset).success) return { ok: false, error: "Unknown preset" };
    const [row] = await db()<{ name: string; states: PresetStates }[]>`
      select name, states from switch_presets where id = ${v.preset}
    `;
    if (!row) return { ok: false, error: "That preset was deleted." };
    name = row.name;
    states = row.states;
  }
  const changes: Change[] = SECTION_IDS.map((id) => {
    const s = states[id];
    const state: SwitchState = s && SECTION_BY_ID[id].states.includes(s) ? s : "on";
    return {
      section: id,
      to: { state, message: null, until: null, includeAdmin: false },
    };
  });
  if (needsConfirm(changes.map((c) => ({ section: c.section, state: c.to.state })))) {
    const refused = await confirmed(ctx.session, v, ctx.client);
    if (refused) return refused;
  }
  const r = await applyChanges(ctx.session, ctx.client, changes, v.reason, "control.preset", {
    preset: name,
  });
  return { ok: true, message: `${name}: ${r.summary}`, undoId: r.undoId };
}

export async function savePresetAction(input: unknown): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  const parsed = z.object({ name: z.string().trim().min(2).max(60) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the preset a name (2–60 characters)." };
  if (BUILT_IN_PRESETS.some((p) => p.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return { ok: false, error: "That name is taken by a built-in preset." };
  }
  const rows = await db()<{ section: SectionId; state: SwitchState }[]>`
    select section, state from system_switches where state <> 'on'
  `;
  if (!rows.length) return { ok: false, error: "Everything is on. Switch something first." };
  const states = Object.fromEntries(rows.map((r) => [r.section, r.state]));
  try {
    await db()`
      insert into switch_presets (name, states, created_by)
      values (${parsed.data.name}, ${db().json(states as postgres.JSONValue)}, ${ctx.session.user.email})
    `;
  } catch {
    return { ok: false, error: "A preset with that name already exists." };
  }
  await audit(actorOf(ctx.session), "control.preset_saved", ctx.client, parsed.data.name, {
    states,
  });
  revalidatePath(PAGE);
  return { ok: true, message: `Saved "${parsed.data.name}".` };
}

export async function deletePresetAction(id: string): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown preset" };
  const [row] = await db()<{ name: string }[]>`
    delete from switch_presets where id = ${id} returning name
  `;
  if (row) await audit(actorOf(ctx.session), "control.preset_deleted", ctx.client, row.name);
  revalidatePath(PAGE);
  return { ok: true, message: "Preset deleted." };
}

// ── Undo ──────────────────────────────────────────────────────────────────────────

/** How long after a switch its Undo still works (the button shows for 5 seconds). */
const UNDO_SECONDS = 120;

export async function undoAction(id: string): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  if (!/^\d{1,18}$/.test(id)) return { ok: false, error: "Nothing to undo." };
  const [row] = await db()<
    {
      action: string;
      meta: {
        changes?: { section: SectionId; from?: Snapshot }[];
        access?: { scope: string; target: string; from: AccessSnapshot | null };
      };
      undone: boolean;
    }[]
  >`
    select a.action, a.meta,
      exists (select 1 from audit_logs u where u.action = 'control.undo'
              and u.meta->>'of' = a.id::text) as undone
    from audit_logs a
    where a.id = ${id}::bigint and a.actor_id = ${ctx.session.user.id}
      and a.action in ('control.switch', 'control.preset', 'control.access')
      and a.at > now() - make_interval(secs => ${UNDO_SECONDS})
  `;
  if (!row) return { ok: false, error: "Too late to undo. Switch it back by hand." };
  if (row.undone) return { ok: false, error: "Already undone." };

  if (row.action === "control.access" && row.meta.access) {
    const a = row.meta.access;
    await restoreAccess(a.scope as AccessScopeInput, a.target, a.from, ctx.session.user.email);
    invalidateSwitches();
    await audit(actorOf(ctx.session), "control.undo", ctx.client, `${a.scope}: ${a.target}`, {
      of: id,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Undone." };
  }

  const changes: Change[] = (row.meta.changes ?? []).map((c) => ({
    section: c.section,
    to: c.from ?? { state: "on", message: null, until: null, includeAdmin: false },
  }));
  // A back-on time that has passed in the meantime just means "on"
  for (const c of changes) {
    if (c.to.until && new Date(c.to.until).getTime() <= Date.now()) {
      c.to = { state: "on", message: null, until: null, includeAdmin: false };
    }
  }
  const r = await applyChanges(ctx.session, ctx.client, changes, "Undo", "control.undo", {
    of: id,
  });
  return { ok: true, message: `Undone. ${r.summary}` };
}

// ── User, group and type switches ─────────────────────────────────────────────────

type AccessScopeInput = "user" | "group" | "type";
type AccessSnapshot = {
  state: "readonly" | "hold" | "down";
  message: string | null;
  until: string | null;
};

async function restoreAccess(
  scope: AccessScopeInput,
  target: string,
  to: AccessSnapshot | null,
  by: string,
): Promise<void> {
  if (!to) {
    await db()`delete from access_switches where scope = ${scope} and target = ${target}`;
    return;
  }
  await db()`
    insert into access_switches (scope, target, state, message, until, created_by)
    values (${scope}, ${target}, ${to.state}, ${to.message}, ${to.until}, ${by})
    on conflict (scope, target) do update set state = excluded.state,
      message = excluded.message, until = excluded.until, created_by = excluded.created_by,
      created_at = now()
  `;
}

const accessInput = z
  .object({
    scope: z.enum(["user", "group", "type"]),
    target: z.string().min(1).max(100),
    state: z.enum(["on", "readonly", "hold", "down"]),
    message: messageInput,
    until: untilInput,
    reason: reasonInput,
  })
  .and(confirmInput);

/** What the target is called, or null when it doesn't exist. */
async function accessName(scope: AccessScopeInput, target: string): Promise<string | null> {
  if (scope === "group") return GROUP_LABEL[target as AccessGroup] ?? null;
  if (!z.uuid().safeParse(target).success) return null;
  if (scope === "user") {
    const [u] = await db()<{ email: string }[]>`
      select email from app_users where id = ${target} and role = 'viewer'
    `;
    return u?.email ?? null;
  }
  const [t] = await db()<
    { name: string }[]
  >`select name from certificate_types where id = ${target}`;
  return t?.name ?? null;
}

export async function setAccessAction(input: unknown): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  const parsed = accessInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;
  const name = await accessName(v.scope, v.target);
  if (!name) return { ok: false, error: "Pick who or what to switch." };
  if (v.state === "down") {
    const refused = await confirmed(ctx.session, v, ctx.client);
    if (refused) return refused;
  }
  const [old] = await db()<
    { state: AccessSnapshot["state"]; message: string | null; until: Date | null }[]
  >`select state, message, until from access_switches where scope = ${v.scope} and target = ${v.target}`;
  const from: AccessSnapshot | null = old
    ? { state: old.state, message: old.message, until: old.until ? old.until.toISOString() : null }
    : null;
  const to: AccessSnapshot | null =
    v.state === "on"
      ? null
      : { state: v.state, message: v.message || null, until: v.until ?? null };
  await restoreAccess(v.scope, v.target, to, ctx.session.user.email);
  invalidateSwitches();

  // Down for a person or a group ends their sign-ins now
  let signedOut = 0;
  if (to?.state === "down" && from?.state !== "down" && v.scope !== "type") {
    const rows =
      v.scope === "user"
        ? await db()`
            update sessions set revoked_at = now()
            where user_id = ${v.target} and revoked_at is null returning id`
        : await db()`
            update sessions s set revoked_at = now()
            from app_users u
            where u.id = s.user_id and s.revoked_at is null and s.role = 'viewer'
              and u.can_upload = ${v.target === "uploaders"}
            returning s.id`;
    signedOut = rows.length;
  }

  const label = `${v.scope === "user" ? "Person" : v.scope === "group" ? "Group" : "Type"} ${name}`;
  const summary = `${label}: ${STATE_LABEL[from?.state ?? "on"]} → ${STATE_LABEL[v.state]}`;
  const undoId = await audit(actorOf(ctx.session), "control.access", ctx.client, summary, {
    access: { scope: v.scope, target: v.target, name, from, to },
    reason: v.reason,
    signedOut,
  });
  await alertAdmin(`switched: ${summary}`, [
    `${ctx.session.user.email} changed a Control Center switch:`,
    `• ${summary}${to?.until ? ` (back on ${to.until})` : ""}`,
    `Reason: ${v.reason}`,
    signedOut ? `${signedOut} sign-ins were ended.` : "",
  ]);
  revalidatePath("/", "layout");
  return { ok: true, message: summary, undoId };
}

// ── Schedules ─────────────────────────────────────────────────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 00:00.");

const scheduleInput = z
  .object({
    section: z.enum(SECTION_IDS as [SectionId, ...SectionId[]]),
    state: z.enum(["readonly", "hold", "down"]),
    message: messageInput,
    kind: z.enum(["once", "daily", "weekly"]),
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    startTime: hhmm.nullable().optional(),
    endTime: hhmm.nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    tz: z.string().max(60).default("Asia/Colombo"),
    reason: reasonInput,
  })
  .and(confirmInput);

export async function addScheduleAction(input: unknown): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  const parsed = scheduleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;
  const section = SECTION_BY_ID[v.section];
  if (!section.states.includes(v.state)) {
    return { ok: false, error: `${section.name} can't be set to ${STATE_LABEL[v.state]}.` };
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: v.tz });
  } catch {
    return { ok: false, error: "Unknown time zone." };
  }
  if (v.kind === "once") {
    if (!v.startsAt || !v.endsAt) return { ok: false, error: "Pick a start and an end." };
    if (new Date(v.endsAt) <= new Date(v.startsAt)) {
      return { ok: false, error: "The end must be after the start." };
    }
    if (new Date(v.endsAt).getTime() <= Date.now()) {
      return { ok: false, error: "That window has already ended." };
    }
  } else {
    if (!v.startTime || !v.endTime) return { ok: false, error: "Pick a start and an end time." };
    if (v.startTime === v.endTime) return { ok: false, error: "Start and end can't be the same." };
    if (v.kind === "weekly" && v.days.length === 0) {
      return { ok: false, error: "Pick at least one day." };
    }
  }
  if (needsConfirm([{ section: v.section, state: v.state }])) {
    const refused = await confirmed(ctx.session, v, ctx.client);
    if (refused) return refused;
  }
  const [row] = await db()<{ id: string }[]>`
    insert into switch_schedules (section, state, message, kind, days, start_time, end_time,
                                  starts_at, ends_at, tz, reason, created_by)
    values (${v.section}, ${v.state}, ${v.message || null}, ${v.kind},
            ${v.kind === "weekly" ? [...new Set(v.days)].sort() : []}::smallint[],
            ${v.kind === "once" ? null : (v.startTime ?? null)},
            ${v.kind === "once" ? null : (v.endTime ?? null)},
            ${v.kind === "once" ? (v.startsAt ?? null) : null},
            ${v.kind === "once" ? (v.endsAt ?? null) : null},
            ${v.tz}, ${v.reason}, ${ctx.session.user.email})
    returning id::text
  `;
  invalidateSwitches();
  const summary = `${section.name} ${STATE_LABEL[v.state]} (${v.kind === "once" ? "one-off" : v.kind})`;
  await audit(actorOf(ctx.session), "control.schedule_added", ctx.client, summary, {
    schedule: row?.id,
    ...v,
    passkey: undefined,
    confirm: undefined,
  });
  await alertAdmin(`maintenance window added: ${summary}`, [
    `${ctx.session.user.email} added a maintenance window: ${summary}.`,
    `Reason: ${v.reason}`,
  ]);
  revalidatePath("/", "layout");
  return { ok: true, message: `Added: ${summary}` };
}

export async function setScheduleEnabledAction(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown schedule" };
  const [row] = await db()<{ section: SectionId; state: SwitchState }[]>`
    update switch_schedules set enabled = ${enabled} where id = ${id} returning section, state
  `;
  if (!row) return { ok: false, error: "That schedule was deleted." };
  invalidateSwitches();
  const summary = `${SECTION_BY_ID[row.section].name} ${STATE_LABEL[row.state]}`;
  await audit(
    actorOf(ctx.session),
    enabled ? "control.schedule_resumed" : "control.schedule_paused",
    ctx.client,
    summary,
    { schedule: id },
  );
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? "Schedule on." : "Schedule paused." };
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  const ctx = await control();
  if (!ctx) return LOCKED;
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown schedule" };
  const [row] = await db()<{ section: SectionId; state: SwitchState }[]>`
    delete from switch_schedules where id = ${id} returning section, state
  `;
  if (row) {
    invalidateSwitches();
    await audit(
      actorOf(ctx.session),
      "control.schedule_deleted",
      ctx.client,
      `${SECTION_BY_ID[row.section].name} ${STATE_LABEL[row.state]}`,
      { schedule: id },
    );
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Schedule deleted." };
}
