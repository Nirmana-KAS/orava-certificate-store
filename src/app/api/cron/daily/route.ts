import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/server/audit";
import { BACKUP_EVERY_DAYS, backupDue, backupSummary } from "@/lib/server/backup";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { sendMail } from "@/lib/server/mail";
import { clientInfo } from "@/lib/server/request";
import { TRASH_DAYS, eraseExpired } from "@/lib/server/trash";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "private, no-store" };

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Vercel Cron sends "Authorization: Bearer <secret>"; cron-job.org can send x-cron-secret. */
function authorized(request: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  return (
    same(request.headers.get("authorization") ?? "", `Bearer ${secret}`) ||
    same(request.headers.get("x-cron-secret") ?? "", secret)
  );
}

/**
 * Once a day (Vercel Cron, 03:00 Sri Lanka time): erases what has been in the Trash for 30
 * days, and emails a reminder when no backup was made in the last 7 days.
 */
export async function GET(request: NextRequest) {
  if (!env().CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503, headers });
  }
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const client = await clientInfo();

  let erased = { certificates: 0, versions: 0 };
  let trashError: string | null = null;
  try {
    // A few rounds, in case a lot expired on the same day
    for (let i = 0; i < 5; i++) {
      const r = await eraseExpired(200);
      erased = {
        certificates: erased.certificates + r.certificates,
        versions: erased.versions + r.versions,
      };
      if (r.certificates + r.versions < 200) break;
    }
  } catch (error) {
    console.error("daily trash clean-up failed", error);
    trashError = "Trash clean-up failed";
  }
  if (erased.certificates + erased.versions > 0) {
    await audit(
      null,
      "trash.auto_erase",
      client,
      `${erased.certificates + erased.versions} older than ${TRASH_DAYS} days`,
      erased,
    );
  }

  let reminded = false;
  const summary = await backupSummary();
  if (backupDue(summary)) {
    const [recent] = await db()<{ n: number }[]>`
      select count(*)::int as n from audit_logs
      where action = 'backup.reminder' and at > now() - make_interval(days => ${BACKUP_EVERY_DAYS})
    `;
    if (!recent?.n) {
      const [row] = await db()<{ alert_email: string | null }[]>`
        select alert_email from app_settings where id = true
      `;
      const to = row?.alert_email || env().ADMIN_EMAIL;
      const siteUrl = env().NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
      try {
        await sendMail({
          to,
          subject: `${site.name}: time for a backup`,
          text: [
            summary.lastBackup
              ? `The last backup was made more than ${BACKUP_EVERY_DAYS} days ago.`
              : "No backup has been made yet.",
            `There are ${summary.certificates} certificates and ${summary.files} files stored.`,
            "",
            "The free database has no automatic backups. Sign in as admin and open Backup to",
            `download a copy${siteUrl ? `: ${siteUrl}/admin/backup` : "."}`,
          ].join("\n"),
        });
        reminded = true;
        await audit(null, "backup.reminder", client, to);
      } catch (error) {
        console.error("backup reminder failed", error);
      }
    }
  }

  return NextResponse.json(
    { ok: !trashError, erased, backupDue: backupDue(summary), reminded, error: trashError },
    { headers },
  );
}
