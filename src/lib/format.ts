const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Colombo",
});

/** "30 Oct 2026, 14:05" in Sri Lanka time. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  return dateTime.format(new Date(value));
}

const dateOnly = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Colombo",
});

/** "30 Oct 2026" in Sri Lanka time. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  return dateOnly.format(new Date(value));
}

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Colombo",
});

/** "14:05" in Sri Lanka time. */
export function formatTime(value: Date | string): string {
  return time.format(new Date(value));
}

const actionLabels: Record<string, string> = {
  sign_in: "Signed in",
  "sign_in.code_sent": "Sign-in code sent",
  sign_out: "Signed out",
  "admin.sign_in": "Admin signed in",
  "admin.setup": "Admin account created",
  "user.add": "Added staff member",
  "user.disable": "Disabled staff member",
  "user.enable": "Enabled staff member",
  "user.remove": "Removed staff member",
  "user.sign_out": "Signed out staff member",
  "user.download_permission": "Changed download permission",
  "user.report_permission": "Changed report permission",
  "user.uploader_on": "Made staff member an uploader",
  "user.uploader_off": "Stopped uploads for staff member",
  "user.upload_passkey_reset": "Issued a new upload passkey",
  "upload.unlock": "Unlocked upload mode",
  "upload.lock": "Locked upload mode",
  "report.export": "Downloaded a report",
  "upload.locked": "Upload mode locked after wrong passkeys",
  "settings.passkey_rotated": "Changed the shared passkey",
  "settings.lockdown_on": "Turned lockdown on",
  "settings.lockdown_off": "Turned lockdown off",
  "settings.device_code": "Changed new-device codes",
  "settings.session_hours": "Changed sign-in length",
  "settings.sign_out_everyone": "Signed out all staff",
  "certificate.create": "Added a certificate",
  "certificate.update": "Edited a certificate",
  "certificate.delete": "Moved a certificate to the Trash",
  "certificate.import": "Added a certificate from a file",
  "certificate.import_auto": "Added a certificate from a file (read automatically)",
  "certificate.import_discard": "Took back an imported certificate",
  "certificate.replace": "Replaced a certificate with the same report number",
  "certificate.restore_version": "Restored an earlier version",
  "file.upload": "Attached a file",
  "file.remove": "Removed a file",
  "file.view": "Opened a file",
  "file.download": "Downloaded a file",
  "file.rename_standard": "Renamed stored files",
  "type.create": "Added a certificate type",
  "type.update": "Edited a certificate type",
  "type.archive": "Archived a certificate type",
  "type.restore": "Restored a certificate type",
  "lab.create": "Added a lab",
  "lab.update": "Edited a lab",
  "lab.archive": "Archived a lab",
  "lab.restore": "Restored a lab",
  "trash.restore": "Restored a certificate from the Trash",
  "trash.erase": "Deleted a certificate for good",
  "trash.empty": "Emptied the Trash",
  "trash.auto_erase": "Erased certificates older than 30 days",
  "backup.export": "Started a backup download",
  "backup.complete": "Finished a backup download",
  "backup.reminder": "Sent a backup reminder",
  "activity.export": "Downloaded the activity log",
};

export function actionLabel(action: string): string {
  return actionLabels[action] ?? action;
}
