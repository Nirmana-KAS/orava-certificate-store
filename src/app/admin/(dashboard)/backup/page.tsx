import type { Metadata } from "next";
import { Archive, FileStack, History, Trash2 } from "lucide-react";

import { BackupPanel } from "@/components/admin/backup-panel";
import { PageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/files/rules";
import { formatDateTime } from "@/lib/format";
import { BACKUP_EVERY_DAYS, backupDue, backupSummary } from "@/lib/server/backup";
import { requireAdmin } from "@/lib/server/session";
import { storageConfigured } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Backup" };

export default async function BackupPage() {
  await requireAdmin();
  const s = await backupSummary();
  const due = backupDue(s);

  const tiles = [
    { label: "Certificates", value: s.certificates.toLocaleString("en-GB"), icon: FileStack },
    { label: "In the Trash", value: s.trash.toLocaleString("en-GB"), icon: Trash2 },
    { label: "Files", value: `${s.files} · ${formatBytes(s.fileBytes)}`, icon: Archive },
    { label: "Activity entries", value: s.activity.toLocaleString("en-GB"), icon: History },
  ];

  return (
    <>
      <PageHeader
        title="Backup"
        description="The free database has no automatic backups. Download a copy of everything to your computer once a week."
      />

      {due ? (
        <Alert variant="warning" className="mb-6">
          {s.lastBackup
            ? `The last backup was more than ${BACKUP_EVERY_DAYS} days ago. Download a new one now.`
            : "No backup has been made yet. Download one now."}
        </Alert>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="gap-2 py-4">
            <CardContent className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold wrap-anywhere tabular-nums">{value}</p>
              </div>
              <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Download a backup</CardTitle>
          <CardDescription>
            Last backup:{" "}
            <span data-testid="last-backup">
              {s.lastBackup
                ? `${formatDateTime(s.lastBackup.at)}${s.lastBackup.by ? ` by ${s.lastBackup.by}` : ""}`
                : "never"}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackupPanel files={s.files} fileBytes={s.fileBytes} storageReady={storageConfigured()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About backups</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              One zip file with every table of the database (as JSON) and every certificate file
              under its stored name. Certificates in the Trash are included too.
            </li>
            <li>
              Passwords, passkeys, the authenticator secret and sign-ins are left out on purpose.
              They are set up again after a restore.
            </li>
            <li>
              Files come straight from storage to your computer, so the backup works on the free
              plans. Use a laptop for a full backup; on Chrome or Edge a large backup is saved
              straight to a folder you choose.
            </li>
            <li>
              The file holds every certificate. Keep it somewhere safe, such as an encrypted drive,
              and delete old copies you no longer need.
            </li>
            <li>
              Every backup is in the Activity log. If none is made for {BACKUP_EVERY_DAYS} days, a
              reminder is emailed to the alert address.
            </li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
