"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import type { FormState } from "@/lib/validation";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  hint: string;
  /** Show "remember this device" (staff email codes only) */
  remember?: boolean;
};

export function CodeForm({ action: serverAction, label, hint, remember }: Props) {
  const [state, action] = useActionState(serverAction, null);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormAlert state={state} />
      <Field
        label={label}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="123456"
        icon={<KeyRound />}
        className="tracking-[0.3em]"
        hint={hint}
        error={state?.fields?.code}
        autoFocus
        required
      />
      {remember ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="size-5 shrink-0 cursor-pointer accent-primary"
          />
          Remember this device for 30 days
        </label>
      ) : null}
      <SubmitButton size="lg" className="w-full" pendingText="Checking…">
        Continue
      </SubmitButton>
    </form>
  );
}
