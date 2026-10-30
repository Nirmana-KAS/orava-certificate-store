"use server";

import { redirect } from "next/navigation";

import { audit, securityEvent } from "@/lib/server/audit";
import {
  checkEmailCode,
  closeChallenge,
  countAttempt,
  MAX_CODE_ATTEMPTS,
  pendingChallenge,
  startChallenge,
} from "@/lib/server/challenges";
import { adminExists } from "@/lib/server/admin";
import { decrypt, encrypt, safeEqual } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { isTrustedDevice, trustThisDevice } from "@/lib/server/devices";
import { env } from "@/lib/server/env";
import { sendMail } from "@/lib/server/mail";
import { hashSecret, verifySecret } from "@/lib/server/password";
import { minutesText } from "@/lib/server/rate-limit-policy";
import { checkLimit, isIpBlocked, recordAttempt } from "@/lib/server/rate-limit";
import { clientInfo, type ClientInfo } from "@/lib/server/request";
import { createSession, endCurrentSession } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { checkTotp } from "@/lib/server/totp";
import { site } from "@/lib/site";
import {
  adminPasswordSchema,
  adminSignInSchema,
  fieldErrors,
  passkeySchema,
  signInSchema,
  sixDigitCode,
  type FormState,
} from "@/lib/validation";

const WRONG_PASSKEY = "That email and passkey don't match a permitted account.";
const WRONG_ADMIN = "That email and password don't match the admin account.";
const BLOCKED = "Sign-in from your network is blocked. Please contact the admin.";

// A real Argon2 hash to compare against when the account doesn't exist, so timing doesn't reveal it.
let dummyHash: Promise<string> | undefined;
function dummy(): Promise<string> {
  dummyHash ??= hashSecret("orava-timing-equaliser");
  return dummyHash;
}

async function guard(client: ClientInfo, email: string | null): Promise<string | null> {
  if (await isIpBlocked(client.ip)) {
    await securityEvent("blocked_ip_attempt", "medium", client, email);
    return BLOCKED;
  }
  const limit = await checkLimit(client, email);
  if (!limit.allowed) {
    return `Too many attempts. Try again in ${minutesText(limit.retryAfterSec)}.`;
  }
  return null;
}

// ── Staff: email + shared passkey ────────────────────────────────────────────────

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    passkey: formData.get("passkey"),
  });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };
  const { email, passkey } = parsed.data;

  const client = await clientInfo();
  const blocked = await guard(client, email);
  if (blocked) return { error: blocked, values };

  const settings = await getSettings();
  if (settings.lockdown) return { error: "Sign-in is paused by the admin right now.", values };
  if (!settings.passkeySet)
    return { error: "Sign-in isn't set up yet. Please contact the admin.", values };

  const [user] = await db()<{ id: string; email: string; role: string; status: string }[]>`
    select id, email, role, status from app_users where email = ${email}
  `;
  const passkeyOk = await verifySecret(settings.passkeyHash, passkey);

  if (!user || user.role !== "viewer" || user.status !== "active" || !passkeyOk) {
    await recordAttempt(client, email, "passkey", false);
    if (!user) await securityEvent("unknown_email", "low", client, email);
    else if (user.status !== "active")
      await securityEvent("disabled_user_attempt", "low", client, email);
    return { error: WRONG_PASSKEY, values };
  }
  await recordAttempt(client, email, "passkey", true);

  if (settings.requireDeviceCode && !(await isTrustedDevice(user.id))) {
    const { code } = await startChallenge(user.id, "email_code", client);
    try {
      await sendMail({
        to: user.email,
        subject: `${code} is your ${site.name} code`,
        text: [
          `Your sign-in code is ${code}`,
          "",
          "It expires in 10 minutes. If you didn't try to sign in, tell the admin.",
          "",
          `${site.name} · ${site.company}`,
        ].join("\n"),
      });
    } catch (error) {
      console.error("sign-in code email failed", error);
      await securityEvent("email_send_failed", "medium", client, email);
      return { error: "We couldn't send your sign-in code. Please try again shortly.", values };
    }
    await audit({ id: user.id, email: user.email }, "sign_in.code_sent", client);
    redirect("/verify");
  }

  await createSession({ id: user.id, email: user.email, role: "viewer" }, client, settings);
  await audit({ id: user.id, email: user.email }, "sign_in", client);
  redirect("/certificates");
}

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const challenge = await pendingChallenge();
  if (!challenge || challenge.kind !== "email_code") {
    return { error: "This code has expired. Please sign in again." };
  }
  const parsed = sixDigitCode.safeParse(formData.get("code"));
  if (!parsed.success)
    return { fields: { code: parsed.error.issues[0]?.message ?? "Invalid code" } };

  const client = await clientInfo();
  const blocked = await guard(client, challenge.user.email);
  if (blocked) return { error: blocked };

  const ok = await checkEmailCode(challenge.id, parsed.data);
  if (!ok) {
    await recordAttempt(client, challenge.user.email, "email_code", false);
    const left = MAX_CODE_ATTEMPTS - (challenge.attempts + 1);
    return {
      error:
        left > 0
          ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "Too many wrong codes. Please sign in again.",
    };
  }
  await closeChallenge(challenge.id);
  await recordAttempt(client, challenge.user.email, "email_code", true);

  const settings = await getSettings();
  if (challenge.user.status !== "active" || challenge.user.role !== "viewer" || settings.lockdown) {
    return { error: WRONG_PASSKEY };
  }
  if (formData.get("remember") === "on") await trustThisDevice(challenge.user.id, client);
  await createSession(
    { id: challenge.user.id, email: challenge.user.email, role: "viewer" },
    client,
    settings,
  );
  await audit({ id: challenge.user.id, email: challenge.user.email }, "sign_in", client, null, {
    newDevice: true,
  });
  redirect("/certificates");
}

// ── Admin: email + password, then authenticator code ────────────────────────────

export async function adminSignInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = adminSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };
  const { email, password } = parsed.data;

  const client = await clientInfo();
  const blocked = await guard(client, email);
  if (blocked) return { error: blocked, values };

  const [admin] = await db()<{ id: string; status: string; password_hash: string }[]>`
    select u.id, u.status, c.password_hash
    from app_users u join admin_credentials c on c.user_id = u.id
    where u.email = ${email} and u.role = 'admin'
  `;
  const ok = await verifySecret(admin?.password_hash ?? (await dummy()), password);

  if (!admin || admin.status !== "active" || !ok) {
    await recordAttempt(client, email, "admin_password", false);
    await securityEvent("admin_sign_in_failed", "medium", client, email);
    return { error: WRONG_ADMIN, values };
  }
  await recordAttempt(client, email, "admin_password", true);
  await startChallenge(admin.id, "totp", client);
  redirect("/admin/login/verify");
}

export async function adminTotpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const challenge = await pendingChallenge();
  if (!challenge || challenge.kind !== "totp") {
    return { error: "This step has expired. Please sign in again." };
  }
  const parsed = sixDigitCode.safeParse(formData.get("code"));
  if (!parsed.success)
    return { fields: { code: parsed.error.issues[0]?.message ?? "Invalid code" } };

  const client = await clientInfo();
  const blocked = await guard(client, challenge.user.email);
  if (blocked) return { error: blocked };

  const [cred] = await db()<{ totp_secret_enc: string }[]>`
    select totp_secret_enc from admin_credentials where user_id = ${challenge.user.id}
  `;
  const secret = cred ? decrypt(env().AUTH_SECRET, cred.totp_secret_enc) : null;

  if (!secret || !(await checkTotp(secret, parsed.data))) {
    const attempts = await countAttempt(challenge.id);
    await recordAttempt(client, challenge.user.email, "totp", false);
    await securityEvent("admin_2fa_failed", "high", client, challenge.user.email);
    const left = MAX_CODE_ATTEMPTS - attempts;
    return {
      error:
        left > 0
          ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "Too many wrong codes. Please sign in again.",
    };
  }
  await closeChallenge(challenge.id);
  await recordAttempt(client, challenge.user.email, "totp", true);

  const settings = await getSettings();
  await createSession(
    { id: challenge.user.id, email: challenge.user.email, role: "admin" },
    client,
    settings,
  );
  await audit({ id: challenge.user.id, email: challenge.user.email }, "admin.sign_in", client);
  await securityEvent("admin_sign_in", "info", client, challenge.user.email);
  redirect("/admin");
}

// ── First-time admin setup ───────────────────────────────────────────────────────

export async function setupAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const e = env();
  const client = await clientInfo();
  if (await adminExists()) redirect("/admin/login");

  const blocked = await guard(client, e.ADMIN_EMAIL);
  if (blocked) return { error: blocked };

  const token = String(formData.get("setupToken") ?? "");
  if (!e.ADMIN_SETUP_TOKEN || !safeEqual(token, e.ADMIN_SETUP_TOKEN)) {
    await recordAttempt(client, e.ADMIN_EMAIL, "setup", false);
    await securityEvent("admin_setup_failed", "high", client, e.ADMIN_EMAIL);
    return { fields: { setupToken: "The setup token is not correct." } };
  }

  const fields: Record<string, string> = {};
  const password = adminPasswordSchema.safeParse(formData.get("password"));
  if (!password.success) fields.password = password.error.issues[0]!.message;
  else if (password.data !== formData.get("confirmPassword"))
    fields.confirmPassword = "The passwords don't match.";

  const passkey = passkeySchema.safeParse(formData.get("passkey"));
  if (!passkey.success) fields.passkey = passkey.error.issues[0]!.message;
  else if (password.success && passkey.data === password.data)
    fields.passkey = "Use a different value from your admin password.";

  let totpSecret: string | null = null;
  try {
    totpSecret = decrypt(e.AUTH_SECRET, String(formData.get("totpSecret") ?? ""));
  } catch {
    return { error: "The setup page expired. Please reload it and scan the new QR code." };
  }
  const code = sixDigitCode.safeParse(formData.get("totpCode"));
  if (!code.success) fields.totpCode = code.error.issues[0]!.message;
  else if (!(await checkTotp(totpSecret, code.data)))
    fields.totpCode = "That code isn't right. Check the time on your phone and try again.";

  if (Object.keys(fields).length > 0 || !password.success || !passkey.success) return { fields };

  const passwordHash = await hashSecret(password.data);
  const passkeyHash = await hashSecret(passkey.data);

  const admin = await db().begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into app_users (email, name, role) values (${e.ADMIN_EMAIL}, ${site.developer}, 'admin')
      returning id
    `;
    await tx`
      insert into admin_credentials (user_id, password_hash, totp_secret_enc)
      values (${user!.id}, ${passwordHash}, ${encrypt(e.AUTH_SECRET, totpSecret!)})
    `;
    await tx`
      update app_settings set passkey_hash = ${passkeyHash}, passkey_rotated_at = now(),
        alert_email = ${e.ADMIN_EMAIL}, updated_at = now()
      where id = true
    `;
    return user!;
  });

  await recordAttempt(client, e.ADMIN_EMAIL, "setup", true);
  await createSession(
    { id: admin.id, email: e.ADMIN_EMAIL, role: "admin" },
    client,
    await getSettings(),
  );
  await audit({ id: admin.id, email: e.ADMIN_EMAIL }, "admin.setup", client);
  await securityEvent("admin_setup_completed", "info", client, e.ADMIN_EMAIL);
  redirect("/admin");
}

// ── Sign out ─────────────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const client = await clientInfo();
  const session = await endCurrentSession();
  if (session) await audit({ id: session.user.id, email: session.user.email }, "sign_out", client);
  redirect(session?.user.role === "admin" ? "/admin/login" : "/");
}
