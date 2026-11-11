"use server";

import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { BACKUP_TABLES } from "@/lib/server/backup";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
import { site } from "@/lib/site";

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
