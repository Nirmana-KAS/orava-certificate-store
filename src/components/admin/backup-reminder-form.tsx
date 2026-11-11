"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { setBackupReminderAction } from "@/lib/admin/backup-actions";
import { REMIND_CHOICES } from "@/lib/backup/reminders";

/** How often to be reminded about backups, and how: a banner on the Overview and/or an email. */
export function BackupReminderForm({
  days,
  banner,
  email,
}: {
  days: number;
  banner: boolean;
  email: boolean;
}) {
  const [state, action] = useActionState(setBackupReminderAction, null);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="remind-days">Remind me when no backup was made</Label>
        <Select id="remind-days" name="days" defaultValue={String(days)}>
          {REMIND_CHOICES.map((c) => (
            <option key={c.days} value={c.days}>
              {c.label}
            </option>
          ))}
        </Select>
        {state?.fields?.days ? (
          <p className="text-sm text-destructive">{state.fields.days}</p>
        ) : null}
      </div>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">How to remind me</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="banner"
            defaultChecked={banner}
            className="size-5 shrink-0 cursor-pointer accent-primary"
          />
          Show a banner on the Overview page
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="email"
            defaultChecked={email}
            className="size-5 shrink-0 cursor-pointer accent-primary"
          />
          Send an email to the alert address
        </label>
      </fieldset>
      <SubmitButton
        variant="outline"
        pendingText="Saving…"
        className="w-full sm:w-auto sm:justify-self-start"
      >
        Save reminder
      </SubmitButton>
    </form>
  );
}
