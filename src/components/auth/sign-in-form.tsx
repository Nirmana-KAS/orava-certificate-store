"use client";

import { LockKeyhole, Mail } from "lucide-react";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { signInAction } from "@/lib/auth/actions";

export function SignInForm() {
  const [state, action] = useActionState(signInAction, null);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormAlert state={state} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@company.com"
        icon={<Mail />}
        defaultValue={state?.values?.email}
        error={state?.fields?.email}
        required
      />
      <Field
        label="Passkey"
        name="passkey"
        autoComplete="current-password"
        icon={<LockKeyhole />}
        error={state?.fields?.passkey}
        hint="The shared passkey your admin gave you."
        control={(props) => <PasswordInput {...props} required />}
      />
      <SubmitButton size="lg" className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
