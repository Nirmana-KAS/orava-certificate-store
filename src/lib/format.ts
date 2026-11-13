const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Colombo",
});

/** "2 h 15 min", "45 min", "Under a minute". */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return "Under a minute";
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return [d ? `${d} d` : "", h ? `${h} h` : "", min ? `${min} min` : ""].filter(Boolean).join(" ");
}

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
  "control.switch": "Control Center: switched",
  "control.preset": "Control Center: used a preset",
  "control.undo": "Control Center: undid a switch",
  "control.access": "Control Center: people/type switch",
  "control.timer_end": "Control Center: back on by timer",
  "control.access_timer_end": "Control Center: back on by timer",
  "control.schedule_added": "Control Center: added a maintenance window",
  "control.schedule_deleted": "Control Center: deleted a maintenance window",
  "control.schedule_paused": "Control Center: paused a maintenance window",
  "control.schedule_resumed": "Control Center: resumed a maintenance window",
  "control.schedule_start": "Control Center: maintenance window opened",
  "control.schedule_end": "Control Center: maintenance window closed",
  "control.preset_saved": "Control Center: saved a preset",
  "control.preset_deleted": "Control Center: deleted a preset",
  "control.unlock": "Control Center: unlocked",
  "control.unlock_failed": "Control Center: wrong passkey",
  "control.passkey_set": "Control Center: set the passkey",
  "control.passkey_changed": "Control Center: changed the passkey",
  "control.rescue_sent": "Control Center: rescue link sent",
  "control.rescue_used": "Control Center: rescue link used",
  "settings.device_code": "Changed new-device codes",
  "settings.session_hours": "Changed sign-in length",
  "settings.sign_out_everyone": "Signed out all staff",
  "settings.backup_reminder": "Changed backup reminders",
  "settings.require_location": "Changed the location rule",
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
  "certificate.view": "Opened certificate details",
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
  "system.check": "Checked the system",
  "system.diagnose": "Ran Diagnose & Fix",
  "system.report": "Downloaded a Diagnose & Fix report",
  "system.redeploy": "Started a redeploy",
  "activity.export": "Downloaded the activity log",
};

export function actionLabel(action: string): string {
  return actionLabels[action] ?? action;
}
