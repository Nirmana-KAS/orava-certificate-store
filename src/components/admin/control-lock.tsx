"use client";

import { KeyRound, LifeBuoy, LoaderCircle, ShieldAlert } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  sendRescueAction,
  setControlPasskeyAction,
  unlockControlAction,
  rescueEverythingAction,
  type ActionResult,
} from "@/lib/admin/control-actions";

/** First visit (or after a rescue link): choose the Control passkey. */
export function SetControlPasskeyForm({ change = false }: { change?: boolean }) {
  const [state, action] = useActionState(setControlPasskeyAction, null);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormAlert state={state} />
      {change ? (
        <Field
          label="Current Control passkey"
          name="current"
          autoComplete="current-password"
          error={state?.fields?.current}
          control={(props) => <PasswordInput {...props} required />}
        />
      ) : null}
      <Field
        label={change ? "New Control passkey" : "Control passkey"}
        name="passkey"
        autoComplete="new-password"
        hint="At least 10 characters. Not your admin password and not the staff passkey."
        error={state?.fields?.passkey}
        control={(props) => <PasswordInput {...props} required />}
      />
      <Field
        label="Type it again"
        name="repeat"
        autoComplete="new-password"
        error={state?.fields?.repeat}
        control={(props) => <PasswordInput {...props} required />}
      />
      <SubmitButton className="w-full sm:w-auto" pendingText="Saving…">
        <KeyRound aria-hidden="true" /> {change ? "Change Control passkey" : "Set and open"}
      </SubmitButton>
    </form>
  );
}

export function UnlockControlForm({ lockedFor }: { lockedFor?: string | null }) {
  const [state, action] = useActionState(unlockControlAction, null);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormAlert state={state} />
      {lockedFor ? (
        <Alert variant="error">
          Locked after too many wrong passkeys. Try again in {lockedFor}, or use the rescue link.
        </Alert>
      ) : null}
      <Field
        label="Control passkey"
        name="passkey"
        autoComplete="current-password"
        error={state?.fields?.passkey}
        control={(props) => <PasswordInput {...props} required autoFocus />}
      />
      <SubmitButton className="w-full sm:w-auto" pendingText="Checking…">
        <KeyRound aria-hidden="true" /> Unlock for 10 minutes
      </SubmitButton>
    </form>
  );
}

/** Emails a single-use link that turns everything back on and clears the Control passkey. */
export function RescueButton() {
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<ActionResult | null>(null);
  return (
    <div className="grid gap-3">
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto sm:justify-self-start"
        disabled={pending}
        onClick={() => start(async () => setResult(await sendRescueAction()))}
      >
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LifeBuoy />}
        Send rescue link
      </Button>
      <div aria-live="polite">
        {result ? (
          <Alert variant={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

export function UseRescueButton({ token }: { token: string }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto sm:justify-self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await rescueEverythingAction(token);
            if (!r.ok) setError(r.error);
          })
        }
        data-testid="use-rescue"
      >
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldAlert />}
        Turn everything back on
      </Button>
      <div aria-live="polite">{error ? <Alert variant="error">{error}</Alert> : null}</div>
    </div>
  );
}
