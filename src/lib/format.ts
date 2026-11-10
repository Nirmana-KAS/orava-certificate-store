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
};

export function actionLabel(action: string): string {
  return actionLabels[action] ?? action;
}
