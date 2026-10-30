"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, securityEvent } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { forgetUserDevices } from "@/lib/server/devices";
import { hashSecret, verifySecret } from "@/lib/server/password";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin, revokeAllViewerSessions, revokeUserSessions } from "@/lib/server/session";
import { fieldErrors, newUserSchema, passkeySchema, type FormState } from "@/lib/validation";

const uuid = z.uuid();

async function context() {
  const session = await requireAdmin();
  const client = await clientInfo();
  const actor = { id: session.user.id, email: session.user.email };
  return { session, client, actor };
}

async function viewerEmail(userId: string): Promise<string | null> {
  const [row] = await db()<{ email: string }[]>`
    select email from app_users where id = ${userId} and role = 'viewer'
  `;
  return row?.email ?? null;
}

// ── Staff list ───────────────────────────────────────────────────────────────────

export async function addUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, client } = await context();
  const parsed = newUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") ?? undefined,
    canDownload: formData.get("canDownload") === "on",
  });
  const values = {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
  };
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  const rows = await db()`
    insert into app_users (email, name, role, can_download, created_by)
    values (${parsed.data.email}, ${parsed.data.name}, 'viewer', ${parsed.data.canDownload}, ${actor.id})
    on conflict (email) do nothing
    returning id
  `;
  if (rows.length === 0) return { fields: { email: "This email is already on the list." }, values };

  await audit(actor, "user.add", client, parsed.data.email, {
    canDownload: parsed.data.canDownload,
  });
  revalidatePath("/admin/users");
  return { success: `${parsed.data.email} can now sign in with the shared passkey.` };
}

export async function setUserStatusAction(
  userId: string,
  status: "active" | "disabled",
): Promise<void> {
  const { actor, client } = await context();
  if (!uuid.safeParse(userId).success) return;
  const email = await viewerEmail(userId);
  if (!email) return;

  await db()`update app_users set status = ${status}, updated_at = now() where id = ${userId}`;
  if (status === "disabled") {
    await revokeUserSessions(userId);
    await forgetUserDevices(userId);
  }
  await audit(actor, status === "disabled" ? "user.disable" : "user.enable", client, email);
  revalidatePath("/admin/users");
}

export async function setUserDownloadAction(userId: string, canDownload: boolean): Promise<void> {
  const { actor, client } = await context();
  if (!uuid.safeParse(userId).success) return;
  const email = await viewerEmail(userId);
  if (!email) return;

  await db()`update app_users set can_download = ${canDownload}, updated_at = now() where id = ${userId}`;
  await audit(actor, "user.download_permission", client, email, { canDownload });
  revalidatePath("/admin/users");
}

export async function signOutUserAction(userId: string): Promise<void> {
  const { actor, client } = await context();
  if (!uuid.safeParse(userId).success) return;
  const email = await viewerEmail(userId);
  if (!email) return;

  const count = await revokeUserSessions(userId);
  await forgetUserDevices(userId);
  await audit(actor, "user.sign_out", client, email, { sessions: count });
  revalidatePath("/admin/users");
}

export async function removeUserAction(userId: string): Promise<void> {
  const { actor, client } = await context();
  if (!uuid.safeParse(userId).success) return;
  const email = await viewerEmail(userId);
  if (!email) return;

  await db()`delete from app_users where id = ${userId} and role = 'viewer'`;
  await audit(actor, "user.remove", client, email);
  revalidatePath("/admin/users");
}

// ── Access settings ──────────────────────────────────────────────────────────────

export async function rotatePasskeyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor, client } = await context();
  const parsed = passkeySchema.safeParse(formData.get("passkey"));
  if (!parsed.success) return { fields: { passkey: parsed.error.issues[0]!.message } };
  if (parsed.data !== formData.get("confirmPasskey")) {
    return { fields: { confirmPasskey: "The two passkeys don't match." } };
  }

  const [cred] = await db()<{ password_hash: string }[]>`
    select password_hash from admin_credentials where user_id = ${actor.id}
  `;
  if (await verifySecret(cred?.password_hash, parsed.data)) {
    return { fields: { passkey: "Use a different value from your admin password." } };
  }

  await db()`
    update app_settings
    set passkey_hash = ${await hashSecret(parsed.data)}, passkey_version = passkey_version + 1,
        passkey_rotated_at = now(), updated_at = now()
    where id = true
  `;
  const signedOut = await revokeAllViewerSessions();
  await audit(actor, "settings.passkey_rotated", client, null, { signedOut });
  await securityEvent("passkey_rotated", "info", client, actor.email, { signedOut });
  revalidatePath("/admin/settings");
  return {
    success: `Passkey changed. ${signedOut} staff ${signedOut === 1 ? "session was" : "sessions were"} signed out.`,
  };
}

export async function setLockdownAction(on: boolean): Promise<void> {
  const { actor, client } = await context();
  await db()`update app_settings set lockdown = ${on}, updated_at = now() where id = true`;
  const signedOut = on ? await revokeAllViewerSessions() : 0;
  await audit(actor, on ? "settings.lockdown_on" : "settings.lockdown_off", client, null, {
    signedOut,
  });
  await securityEvent(
    on ? "lockdown_on" : "lockdown_off",
    on ? "high" : "info",
    client,
    actor.email,
  );
  revalidatePath("/admin/settings");
}

export async function setDeviceCodeAction(on: boolean): Promise<void> {
  const { actor, client } = await context();
  await db()`update app_settings set require_device_code = ${on}, updated_at = now() where id = true`;
  await audit(actor, "settings.device_code", client, null, { on });
  revalidatePath("/admin/settings");
}

export async function setSessionHoursAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { actor, client } = await context();
  const parsed = z.coerce.number().int().min(1).max(168).safeParse(formData.get("sessionHours"));
  if (!parsed.success) return { fields: { sessionHours: "Choose between 1 and 168 hours." } };
  await db()`update app_settings set session_hours = ${parsed.data}, updated_at = now() where id = true`;
  await audit(actor, "settings.session_hours", client, null, { hours: parsed.data });
  revalidatePath("/admin/settings");
  return { success: `New sign-ins now last ${parsed.data} hours.` };
}

export async function signOutEveryoneAction(): Promise<void> {
  const { actor, client } = await context();
  const signedOut = await revokeAllViewerSessions();
  await audit(actor, "settings.sign_out_everyone", client, null, { signedOut });
  await securityEvent("all_staff_signed_out", "medium", client, actor.email, { signedOut });
  revalidatePath("/admin/settings");
}
