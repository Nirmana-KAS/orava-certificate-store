"use client";

import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { rotatePasskeyAction, setSessionHoursAction } from "@/lib/admin/actions";
import { PASSKEY_MIN } from "@/lib/validation";

export function RotatePasskeyForm() {
  const [state, action] = useActionState(rotatePasskeyAction, null);
  return (
    <form action={action} className="grid gap-4" noValidate key={state?.success}>
      <FormAlert state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="New passkey"
          name="passkey"
          autoComplete="new-password"
          hint={`At least ${PASSKEY_MIN} characters.`}
          error={state?.fields?.passkey}
          control={(props) => <PasswordInput {...props} required />}
        />
        <Field
          label="Confirm new passkey"
          name="confirmPasskey"
          autoComplete="new-password"
          error={state?.fields?.confirmPasskey}
          control={(props) => <PasswordInput {...props} required />}
        />
      </div>
      <SubmitButton
        className="w-full sm:w-auto sm:justify-self-start"
        pendingText="Changing…"
        confirm="Change the passkey? Every staff member is signed out and needs the new passkey."
      >
        Change passkey
      </SubmitButton>
    </form>
  );
}

export function SessionHoursForm({ hours }: { hours: number }) {
  const [state, action] = useActionState(setSessionHoursAction, null);
  return (
    <form
      action={action}
      className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end"
      noValidate
    >
      <div className="sm:col-span-2">
        <FormAlert state={state} />
      </div>
      <Field
        label="Staff sign-in lasts (hours)"
        name="sessionHours"
        type="number"
        inputMode="numeric"
        min={1}
        max={168}
        defaultValue={hours}
        error={state?.fields?.sessionHours}
      />
      <SubmitButton variant="outline" pendingText="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
