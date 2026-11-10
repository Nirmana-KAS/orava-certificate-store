"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { normalizeUploadPasskey, UPLOAD_PASSKEY_MAX_FAILURES } from "@/lib/upload-passkey";
import { audit, securityEvent } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { sendMail } from "@/lib/server/mail";
import { verifySecret } from "@/lib/server/password";
import { checkLimit, isIpBlocked, recordAttempt } from "@/lib/server/rate-limit";
import { clientInfo } from "@/lib/server/request";
import { getSession, UPLOAD_MODE_MINUTES } from "@/lib/server/session";
import type { FormState } from "@/lib/validation";

// Upload mode for uploaders (special staff): after the normal staff sign-in they unlock it with
// their personal upload passkey. It belongs to this sign-in only and ends after 30 minutes
// without activity, when they lock it, or as soon as the admin switches their uploads off.

const passkeyInput = z.string().trim().min(1, "Enter your upload passkey.").max(100);

async function alertEmail(): Promise<string> {
  const [row] = await db()<{ alert_email: string | null }[]>`
    select alert_email from app_settings where id = true
  `;
  return row?.alert_email || env().ADMIN_EMAIL;
}

export async function unlockUploadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.user.role !== "viewer") redirect("/admin");

  const parsed = passkeyInput.safeParse(formData.get("uploadPasskey"));
  if (!parsed.success) return { fields: { uploadPasskey: parsed.error.issues[0]!.message } };

  const client = await clientInfo();
  const email = session.user.email;
  if (await isIpBlocked(client.ip)) {
    await securityEvent("blocked_ip_attempt", "medium", client, email, { step: "upload_unlock" });
    return { error: "Access from this network is blocked. Contact the admin." };
  }
  // Wrong upload passkeys are limited per person by the lock below, and per network here; they
  // don't count against the person's normal sign-in
  const limit = await checkLimit(client, null);
  if (!limit.allowed) return { error: "Too many attempts. Please wait a few minutes." };

  const [user] = await db()<
    {
      can_upload: boolean;
      upload_passkey_hash: string | null;
      upload_locked_at: Date | null;
    }[]
  >`
    select can_upload, upload_passkey_hash, upload_locked_at
    from app_users where id = ${session.user.id} and role = 'viewer' and status = 'active'
  `;
  if (!user?.can_upload || !user.upload_passkey_hash) {
    return { error: "Uploads aren't switched on for you. Ask the admin if you need them." };
  }
  if (user.upload_locked_at) {
    return {
      error:
        "Upload mode is locked after too many wrong passkeys. Ask the admin for a new upload passkey.",
    };
  }

  const ok = await verifySecret(user.upload_passkey_hash, normalizeUploadPasskey(parsed.data));
  await recordAttempt(client, email, "upload_passkey", ok);

  if (!ok) {
    // Counted in the database, so it holds across devices and sign-ins
    const [row] = await db()<{ upload_failures: number }[]>`
      update app_users set upload_failures = upload_failures + 1,
        upload_locked_at = case when upload_failures + 1 >= ${UPLOAD_PASSKEY_MAX_FAILURES}
                                then now() else upload_locked_at end
      where id = ${session.user.id}
      returning upload_failures
    `;
    const failures = row?.upload_failures ?? UPLOAD_PASSKEY_MAX_FAILURES;
    if (failures >= UPLOAD_PASSKEY_MAX_FAILURES) {
      await db()`update sessions set upload_until = null where user_id = ${session.user.id}`;
      await securityEvent("upload_passkey_locked", "high", client, email, { failures });
      await audit({ id: session.user.id, email }, "upload.locked", client, email, { failures });
      await sendMail({
        to: await alertEmail(),
        subject: "Upload mode locked for a staff member",
        text: [
          `Upload mode for ${email} was locked after ${failures} wrong upload passkeys in a row.`,
          `Network: ${client.ip ?? "unknown"}${client.country ? ` (${client.country})` : ""}.`,
          "",
          "If this was them, issue a new upload passkey from Admin → Staff.",
          "If not, switch their uploads off and check the Security Monitor.",
        ].join("\n"),
      }).catch((e) => console.error("upload lock alert failed", e));
      return {
        error:
          "Upload mode is now locked after too many wrong passkeys. The admin has been told and can give you a new one.",
      };
    }
    await securityEvent("upload_passkey_failed", "low", client, email, { failures });
    const left = UPLOAD_PASSKEY_MAX_FAILURES - failures;
    return {
      fields: {
        uploadPasskey: `That upload passkey isn't right. ${left} ${left === 1 ? "try" : "tries"} left before upload mode is locked.`,
      },
    };
  }

  await db()`update app_users set upload_failures = 0 where id = ${session.user.id}`;
  await db()`
    update sessions set upload_until = now() + make_interval(mins => ${UPLOAD_MODE_MINUTES})
    where id = ${session.id}
  `;
  await audit({ id: session.user.id, email }, "upload.unlock", client, email);
  redirect("/upload");
}

export async function lockUploadAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/");
  await db()`update sessions set upload_until = null where id = ${session.id}`;
  if (session.user.role === "viewer" && session.user.uploadUntil) {
    await audit(
      { id: session.user.id, email: session.user.email },
      "upload.lock",
      await clientInfo(),
      session.user.email,
    );
  }
  redirect("/certificates");
}
