"use client";

import { LockKeyhole, Mail } from "lucide-react";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { adminSignInAction } from "@/lib/auth/actions";

export function AdminSignInForm() {
  const [state, action] = useActionState(adminSignInAction, null);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormAlert state={state} />
      <Field
        label="Admin email"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        icon={<Mail />}
        defaultValue={state?.values?.email}
        error={state?.fields?.email}
        required
      />
      <Field
        label="Password"
        name="password"
        autoComplete="current-password"
        icon={<LockKeyhole />}
        error={state?.fields?.password}
        control={(props) => <PasswordInput {...props} required />}
      />
      <SubmitButton size="lg" className="w-full" pendingText="Checking…">
        Continue
      </SubmitButton>
    </form>
  );
}
