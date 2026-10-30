import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { RotatePasskeyForm, SessionHoursForm } from "@/components/admin/settings-forms";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setDeviceCodeAction, setLockdownAction, signOutEveryoneAction } from "@/lib/admin/actions";
import { formatDateTime } from "@/lib/format";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader title="Settings" description="Sign-in rules for staff." />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Shared passkey</CardTitle>
            <CardDescription>
              Last changed {formatDateTime(settings.passkeyRotatedAt)}. Changing it signs out every
              staff member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RotatePasskeyForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Email code on new devices
              <Badge variant={settings.requireDeviceCode ? "success" : "warning"}>
                {settings.requireDeviceCode ? "On" : "Off"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Staff signing in on a new phone or computer must also enter a code sent to their
              email. Recommended.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setDeviceCodeAction.bind(null, !settings.requireDeviceCode)}>
              <SubmitButton variant="outline">
                {settings.requireDeviceCode ? "Turn off" : "Turn on"}
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign-in length</CardTitle>
            <CardDescription>
              How long staff stay signed in. Admin sign-ins always end after 8 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionHoursForm hours={settings.sessionHours} />
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Emergency controls
              {settings.lockdown ? <Badge variant="danger">Lockdown on</Badge> : null}
            </CardTitle>
            <CardDescription>
              Use these if you think the passkey has leaked or the site is under attack.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <form action={signOutEveryoneAction}>
              <SubmitButton
                variant="outline"
                className="w-full sm:w-auto"
                confirm="Sign out every staff member now?"
              >
                Sign out all staff
              </SubmitButton>
            </form>
            <form action={setLockdownAction.bind(null, !settings.lockdown)}>
              <SubmitButton
                variant={settings.lockdown ? "default" : "destructive"}
                className="w-full sm:w-auto"
                confirm={
                  settings.lockdown
                    ? "Turn lockdown off and let staff sign in again?"
                    : "Turn on lockdown? All staff are signed out and only you can sign in."
                }
              >
                {settings.lockdown ? "Turn lockdown off" : "Turn lockdown on"}
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
