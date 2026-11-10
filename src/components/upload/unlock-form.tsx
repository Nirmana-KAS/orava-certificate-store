"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { unlockUploadAction } from "@/lib/upload/actions";

export function UnlockUploadForm() {
  const [state, action] = useActionState(unlockUploadAction, null);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <Field
        label="Upload passkey"
        name="uploadPasskey"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        icon={<KeyRound />}
        hint="Your personal passkey from the admin, for example K7QM-3XPA-W9RT-HC2D."
        error={state?.fields?.uploadPasskey}
        control={(props) => <PasswordInput {...props} required />}
      />
      <SubmitButton className="w-full sm:w-auto sm:justify-self-start" pendingText="Checking…">
        Unlock upload mode
      </SubmitButton>
    </form>
  );
}
