"use client";

import { Mail, User } from "lucide-react";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { addUserAction } from "@/lib/admin/actions";

export function AddUserForm() {
  const [state, action] = useActionState(addUserAction, null);
  return (
    <form action={action} className="grid gap-4" noValidate key={state?.success}>
      <FormAlert state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          icon={<Mail />}
          defaultValue={state?.values?.email}
          error={state?.fields?.email}
          required
        />
        <Field
          label="Name (optional)"
          name="name"
          autoComplete="off"
          icon={<User />}
          defaultValue={state?.values?.name}
          error={state?.fields?.name}
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="canDownload"
          defaultChecked
          className="size-5 shrink-0 cursor-pointer accent-primary"
        />
        Allowed to download certificates
      </label>
      <SubmitButton className="w-full sm:w-auto sm:justify-self-start" pendingText="Adding…">
        Add staff member
      </SubmitButton>
    </form>
  );
}
