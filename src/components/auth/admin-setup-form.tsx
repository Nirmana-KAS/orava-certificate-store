"use client";

import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { setupAdminAction } from "@/lib/auth/actions";
import { ADMIN_PASSWORD_MIN, PASSKEY_MIN } from "@/lib/validation";

type Props = { email: string; totpSecretEnc: string; qrDataUrl: string; manualKey: string };

export function AdminSetupForm({ email, totpSecretEnc, qrDataUrl, manualKey }: Props) {
  const [state, action] = useActionState(setupAdminAction, null);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="grid gap-8" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="totpSecret" value={totpSecretEnc} />

      <fieldset className="grid gap-5">
        <legend className="mb-3 text-base font-semibold">1. Confirm it&apos;s you</legend>
        <Field label="Admin email" name="adminEmail" value={email} readOnly disabled />
        <Field
          label="Setup token"
          name="setupToken"
          autoComplete="off"
          hint="The ADMIN_SETUP_TOKEN value from your environment variables."
          error={f.setupToken}
          control={(props) => <PasswordInput {...props} required />}
        />
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-3 text-base font-semibold">2. Your admin password</legend>
        <Field
          label="Password"
          name="password"
          autoComplete="new-password"
          hint={`At least ${ADMIN_PASSWORD_MIN} characters. Only you use this.`}
          error={f.password}
          control={(props) => <PasswordInput {...props} required />}
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          error={f.confirmPassword}
          control={(props) => <PasswordInput {...props} required />}
        />
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-3 text-base font-semibold">3. Shared staff passkey</legend>
        <Field
          label="Staff passkey"
          name="passkey"
          autoComplete="off"
          hint={`At least ${PASSKEY_MIN} characters. You give this to permitted staff. You can change it any time.`}
          error={f.passkey}
          control={(props) => <PasswordInput {...props} required />}
        />
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-3 text-base font-semibold">4. Authenticator app</legend>
        <p className="text-sm text-muted-foreground">
          Scan this QR code with Google Authenticator, Microsoft Authenticator or any authenticator
          app, then enter the 6-digit code it shows.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR code */}
        <img
          src={qrDataUrl}
          alt="QR code for your authenticator app"
          width={200}
          height={200}
          className="size-50 rounded-lg border bg-white p-2"
        />
        <p className="text-sm break-all text-muted-foreground">
          Can&apos;t scan? Enter this key:{" "}
          <code className="font-mono text-foreground">{manualKey}</code>
        </p>
        <Field
          label="6-digit code"
          name="totpCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="tracking-[0.3em]"
          error={f.totpCode}
          required
        />
      </fieldset>

      <SubmitButton size="lg" className="w-full" pendingText="Setting up…">
        Finish setup
      </SubmitButton>
    </form>
  );
}
