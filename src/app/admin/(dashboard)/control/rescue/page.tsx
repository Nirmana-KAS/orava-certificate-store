import type { Metadata } from "next";
import Link from "next/link";

import { UseRescueButton } from "@/components/admin/control-lock";
import { PageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkRescueToken } from "@/lib/server/control";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Rescue link" };

const PROBLEM = {
  used: "This rescue link was already used, or a newer one was sent.",
  expired: "This rescue link is older than 15 minutes.",
  invalid: "This rescue link isn't complete. Open it straight from the email.",
} as const;

/**
 * Opened from the rescue email (after admin sign-in). Nothing changes until the button is
 * pressed, so an email scanner that opens links can't use it up.
 */
export default async function RescuePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  await requireAdmin();
  const { t = "" } = await searchParams;
  const check = await checkRescueToken(t);
  return (
    <>
      <PageHeader title="Emergency switch-on" />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Turn everything back on</CardTitle>
          <CardDescription>
            Every switch goes back on, user/group/type switches are removed, maintenance windows are
            paused, and you set a new Control passkey.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {check === "ok" ? (
            <UseRescueButton token={t} />
          ) : (
            <>
              <Alert variant="error">{PROBLEM[check]}</Alert>
              <p className="text-sm">
                Ask for a new one on the{" "}
                <Link href="/admin/control" className="font-medium text-primary underline">
                  Control Center
                </Link>{" "}
                page.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
