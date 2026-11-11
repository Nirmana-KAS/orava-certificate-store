"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { REMIND_CHOICES, remindLabel } from "@/lib/backup/reminders";
import { BACKUP_TABLES } from "@/lib/server/backup";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
import { site } from "@/lib/site";
import type { FormState } from "@/lib/validation";

/** Logs that a backup download started, and says what to fetch. */
export async function startBackupAction(withFiles: boolean): Promise<{
  tables: string[];
  version: string;
  by: string;
}> {
  const session = await requireAdmin();
  await audit(
    { id: session.user.id, email: session.user.email },
    "backup.export",
    await clientInfo(),
    withFiles ? "Database and files" : "Database only",
  );
  return { tables: Object.keys(BACKUP_TABLES), version: site.version, by: session.user.email };
}

const stats = z.object({
  withFiles: z.boolean(),
  rows: z.number().int().min(0),
  files: z.number().int().min(0),
  bytes: z.number().int().min(0),
  missing: z.number().int().min(0),
});

/** Logs a finished backup; the Backup page and the weekly reminder use the latest one. */
export async function finishBackupAction(input: z.infer<typeof stats>): Promise<void> {
  const session = await requireAdmin();
  const parsed = stats.safeParse(input);
  if (!parsed.success) return;
  const s = parsed.data;
  await audit(
    { id: session.user.id, email: session.user.email },
    "backup.complete",
    await clientInfo(),
    s.withFiles ? `${s.files} files` : "Database only",
    s,
  );
}

const reminder = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => REMIND_CHOICES.some((c) => c.days === d), "Choose one of the options."),
  banner: z.boolean(),
  email: z.boolean(),
});

/** How often to be reminded about backups, and where (Overview banner, email). */
export async function setBackupReminderAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = reminder.safeParse({
    days: formData.get("days"),
    banner: formData.get("banner") === "on",
    email: formData.get("email") === "on",
  });
  if (!parsed.success) return { fields: { days: "Choose one of the options." } };
  const r = parsed.data;
  await db()`
    update app_settings set backup_remind_days = ${r.days}, backup_remind_banner = ${r.banner},
      backup_remind_email = ${r.email}, updated_at = now()
    where id = true
  `;
  await audit(
    { id: session.user.id, email: session.user.email },
    "settings.backup_reminder",
    await clientInfo(),
    remindLabel(r.days),
    { banner: r.banner, email: r.email },
  );
  revalidatePath("/admin/backup");
  revalidatePath("/admin");
  if (r.days === 0) return { success: "Backup reminders are off." };
  const where = [r.banner ? "a banner on the Overview" : null, r.email ? "an email" : null]
    .filter(Boolean)
    .join(" and ");
  return {
    success: where
      ? `Saved. You get ${where} when no backup was made for ${r.days === 1 ? "a day" : `${r.days} days`}.`
      : "Saved. Both the banner and the email are off, so you won't be reminded.",
  };
}
