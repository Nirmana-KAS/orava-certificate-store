import type { Metadata } from "next";

import { AddUserForm } from "@/components/admin/add-user-form";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  removeUserAction,
  setUserDownloadAction,
  setUserStatusAction,
  signOutUserAction,
} from "@/lib/admin/actions";
import { formatDateTime } from "@/lib/format";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Staff" };

type Row = {
  id: string;
  email: string;
  name: string | null;
  status: "active" | "disabled";
  can_download: boolean;
  last_login_at: Date | null;
  sessions: number;
};

export default async function UsersPage() {
  const users = await db()<Row[]>`
    select u.id, u.email, u.name, u.status, u.can_download, u.last_login_at,
      (select count(*)::int from sessions s
        where s.user_id = u.id and s.revoked_at is null and s.expires_at > now()) as sessions
    from app_users u
    where u.role = 'viewer'
    order by u.status, u.email
  `;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Only emails on this list can sign in with the shared passkey."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add staff member</CardTitle>
          <CardDescription>They sign in with this email and the shared passkey.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddUserForm />
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">
        Permitted staff <span className="font-normal text-muted-foreground">({users.length})</span>
      </h2>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No staff yet. Add the first email above.
        </p>
      ) : (
        <ul className="grid gap-3">
          {users.map((u) => (
            <li key={u.id}>
              <Card className="gap-4 py-4">
                <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-medium break-all">{u.email}</p>
                    {u.name ? <p className="text-sm text-muted-foreground">{u.name}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={u.status === "active" ? "success" : "muted"}>
                        {u.status === "active" ? "Active" : "Disabled"}
                      </Badge>
                      <Badge variant={u.can_download ? "default" : "warning"}>
                        {u.can_download ? "Can download" : "View only"}
                      </Badge>
                      {u.sessions > 0 ? <Badge>Signed in ({u.sessions})</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Last sign-in: {formatDateTime(u.last_login_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <form
                      action={setUserStatusAction.bind(
                        null,
                        u.id,
                        u.status === "active" ? "disabled" : "active",
                      )}
                    >
                      <SubmitButton variant="outline" size="sm">
                        {u.status === "active" ? "Disable" : "Enable"}
                      </SubmitButton>
                    </form>
                    <form action={setUserDownloadAction.bind(null, u.id, !u.can_download)}>
                      <SubmitButton variant="outline" size="sm">
                        {u.can_download ? "Make view only" : "Allow downloads"}
                      </SubmitButton>
                    </form>
                    {u.sessions > 0 ? (
                      <form action={signOutUserAction.bind(null, u.id)}>
                        <SubmitButton variant="outline" size="sm">
                          Sign out
                        </SubmitButton>
                      </form>
                    ) : null}
                    <form action={removeUserAction.bind(null, u.id)}>
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        confirm={`Remove ${u.email}? They will be signed out and can no longer sign in.`}
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
