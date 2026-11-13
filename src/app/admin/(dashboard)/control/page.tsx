import type { Metadata } from "next";
import { Lock, ShieldCheck, ShieldOff } from "lucide-react";

import { SwitchMap, type SectionInfo } from "@/components/admin/control-center";
import {
  RescueButton,
  SetControlPasskeyForm,
  UnlockControlForm,
} from "@/components/admin/control-lock";
import {
  AccessSwitches,
  ChangeLog,
  Presets,
  Schedules,
  StaffPreview,
  type AccessItem,
  type LogItem,
  type SavedPreset,
  type ScheduleItem,
} from "@/components/admin/control-panels";
import { ToastProvider } from "@/components/admin/control-shared";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lockControlAction } from "@/lib/admin/control-actions";
import { formatTime } from "@/lib/format";
import { controlSettings, controlUnlockedUntil } from "@/lib/server/control";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";
import { loadSwitches } from "@/lib/server/switches";
import {
  effectiveStates,
  GROUP_LABEL,
  SECTION_BY_ID,
  SECTION_IDS,
  STATE_LABEL,
  type AccessGroup,
  type PresetStates,
  type SectionId,
} from "@/lib/system/switches";

export const metadata: Metadata = { title: "Control Center" };

const DESCRIPTION =
  "Switch the whole staff side, or one part of it, off and on by hand. The admin dashboard always keeps working, so you can always switch things back.";

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ rescued?: string }>;
}) {
  const session = await requireAdmin();
  const [settings, until, { rescued }] = await Promise.all([
    controlSettings(),
    controlUnlockedUntil(session),
    searchParams,
  ]);

  if (!settings.passkeySet) {
    return (
      <>
        <PageHeader title="Control Center" description={DESCRIPTION} />
        {rescued ? (
          <Alert variant="success" className="mb-6">
            Everything is switched back on. Set a new Control passkey to use the Control Center
            again.
          </Alert>
        ) : null}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Set your Control passkey</CardTitle>
            <CardDescription>
              A second passkey that only opens this page, so a stolen admin sign-in alone can&apos;t
              switch the system off. Each unlock lasts 10 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetControlPasskeyForm />
          </CardContent>
        </Card>
      </>
    );
  }

  if (!until) {
    const lockedFor = settings.lockedMinutes ? `${settings.lockedMinutes} min` : null;
    return (
      <>
        <PageHeader title="Control Center" description={DESCRIPTION} />
        <div className="grid max-w-xl gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="size-5" aria-hidden="true" /> Locked
              </CardTitle>
              <CardDescription>
                Enter your Control passkey. After 3 wrong tries a rescue link is emailed to you;
                after 5 the page locks for 15 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UnlockControlForm lockedFor={lockedFor} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Forgot it, or locked out?</CardTitle>
              <CardDescription>
                The rescue link turns everything back on and lets you set a new Control passkey. It
                works once, for 15 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RescueButton />
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const sql = db();
  const [snap, info, presets, people, types, accessInfo, scheduleInfo, log] = await Promise.all([
    loadSwitches(true),
    sql<
      { section: SectionId; reason: string | null; changed_by: string | null; changed_at: Date }[]
    >`select section, reason, changed_by, changed_at from system_switches`,
    sql<SavedPreset[]>`select id::text, name, states from switch_presets order by name`,
    sql<{ id: string; email: string; canUpload: boolean }[]>`
      select id::text, email, can_upload as "canUpload" from app_users
      where role = 'viewer' and status = 'active' order by email
    `,
    sql<{ id: string; name: string }[]>`
      select id::text, name from certificate_types where not archived order by sort_order, name
    `,
    sql<{ id: string; reason: string | null; by: string | null }[]>`
      select id::text, reason, created_by as by from access_switches
    `,
    sql<{ id: string; reason: string | null }[]>`select id::text, reason from switch_schedules`,
    sql<
      {
        id: string;
        at: Date;
        by: string | null;
        action: string;
        target: string | null;
        reason: string | null;
      }[]
    >`
      select id::text, at, actor_email as by, action, target, meta->>'reason' as reason
      from audit_logs where action like 'control.%' order by at desc limit 60
    `,
  ]);

  const eff = effectiveStates(snap.rows, snap.schedules, new Date());
  const sectionInfo: Partial<Record<SectionId, SectionInfo>> = Object.fromEntries(
    info.map((r) => [
      r.section,
      { reason: r.reason, changedBy: r.changed_by, changedAt: r.changed_at.toISOString() },
    ]),
  );
  const nameOf = (scope: string, target: string) =>
    scope === "group"
      ? (GROUP_LABEL[target as AccessGroup] ?? target)
      : scope === "user"
        ? (people.find((p) => p.id === target)?.email ?? "Removed person")
        : (types.find((t) => t.id === target)?.name ?? "Removed type");
  const access: AccessItem[] = snap.access.map((a) => {
    const extra = accessInfo.find((x) => x.id === a.id);
    return {
      ...a,
      name: nameOf(a.scope, a.target),
      reason: extra?.reason ?? null,
      by: extra?.by ?? null,
    };
  });
  const schedules: ScheduleItem[] = snap.schedules.map((s) => ({
    ...s,
    reason: scheduleInfo.find((x) => x.id === s.id)?.reason ?? null,
  }));
  const off = SECTION_IDS.filter((id) => eff[id].state !== "on");
  const logItems: LogItem[] = log.map((r) => ({ ...r, at: r.at.toISOString() }));

  return (
    <ToastProvider>
      <PageHeader title="Control Center" description={DESCRIPTION} />

      <div className="mb-6 grid gap-3" data-testid="control-overall">
        {off.length ? (
          <Alert variant="warning">
            <p className="font-medium">
              Not fully on:{" "}
              {off
                .map((id) => `${SECTION_BY_ID[id].name} (${STATE_LABEL[eff[id].state]})`)
                .join(", ")}
            </p>
          </Alert>
        ) : (
          <Alert variant="success">Everything is on.</Alert>
        )}
        {rescued ? (
          <Alert variant="success">Everything is switched back on by the rescue link.</Alert>
        ) : null}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
            Unlocked until {formatTime(until)}. It locks itself after that.
          </p>
          <form action={lockControlAction}>
            <SubmitButton variant="outline" size="sm" className="w-full sm:w-auto">
              <Lock /> Lock now
            </SubmitButton>
          </form>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Switches</CardTitle>
          <CardDescription>
            Hold shows staff a friendly &quot;back soon&quot; message and keeps their sign-in. Down
            switches the part off (Down on Sign-in signs every staff member out). Turning anything
            Down, or the whole staff side, asks for your passkey again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SwitchMap eff={eff} info={sectionInfo} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Presets</CardTitle>
            <CardDescription>Set several switches in one go.</CardDescription>
          </CardHeader>
          <CardContent>
            <Presets saved={presets.map((p) => ({ ...p, states: p.states as PresetStates }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>View as staff</CardTitle>
            <CardDescription>What staff see right now, page by page.</CardDescription>
          </CardHeader>
          <CardContent>
            <StaffPreview eff={eff} access={snap.access} people={people} types={types} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>People, groups and types</CardTitle>
            <CardDescription>
              Hold or switch off selected staff, a group, or one certificate type, without stopping
              everyone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccessSwitches rows={access} people={people} types={types} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance windows</CardTitle>
            <CardDescription>
              Switch a part automatically, once or on a repeating schedule (Sri Lanka time).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Schedules rows={schedules} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change log</CardTitle>
            <CardDescription>
              Every switch: who, when, what and why. Also in the Activity log.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <a
              href="/admin/control/log"
              download
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Download the full log (CSV)
            </a>
            <ChangeLog rows={logItems} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldOff className="size-5" aria-hidden="true" /> Auto-protect
              </CardTitle>
              <CardDescription>
                Puts Sign-in on Hold by itself during a large attack, such as a burst of wrong
                passwords, and emails you. It comes with the Security Monitor in the next phase, and
                stays off until you turn it on.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Control passkey</CardTitle>
              <CardDescription>Change it, or email yourself a rescue link.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">
                  Change the Control passkey
                </summary>
                <div className="mt-3">
                  <SetControlPasskeyForm change />
                </div>
              </details>
              <RescueButton />
            </CardContent>
          </Card>
        </div>
      </div>
    </ToastProvider>
  );
}
