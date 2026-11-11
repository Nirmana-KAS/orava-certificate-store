import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  emptyTrashAction,
  eraseFromTrashAction,
  restoreFromTrashAction,
} from "@/lib/admin/trash-actions";
import { audit } from "@/lib/server/audit";
import { formatDate, formatDateTime } from "@/lib/format";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
import {
  TRASH_DAYS,
  daysLeft,
  eraseDate,
  eraseExpired,
  markTrashSeen,
  trashItems,
} from "@/lib/server/trash";

export const metadata: Metadata = { title: "Trash" };

const errors: Record<string, string> = {
  clash:
    "This certificate can't come back yet: another certificate now has the same report number. Delete or change that one first.",
  gone: "That certificate is no longer in the Trash.",
  storage: "File storage didn't answer, so nothing more was erased. Please try again in a minute.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  // Anything past 30 days is erased now, so the list only shows what can still come back
  const expired = await eraseExpired().catch((e) => {
    console.error("trash clean-up failed", e);
    return { certificates: 0, versions: 0 };
  });
  if (expired.certificates + expired.versions > 0) {
    await audit(
      { id: session.user.id, email: session.user.email },
      "trash.auto_erase",
      await clientInfo(),
      `${expired.certificates + expired.versions} older than ${TRASH_DAYS} days`,
      expired,
    );
  }
  const items = await trashItems();
  // The Overview stops mentioning these until something new is deleted
  await markTrashSeen().catch((e) => console.error("trash seen failed", e));
  const restored = one(params.restored);
  const erased = one(params.erased);
  const error = errors[one(params.error) ?? ""];

  return (
    <>
      <PageHeader
        title="Trash"
        description={`Deleted certificates stay here for ${TRASH_DAYS} days with their files, then they are erased for good.`}
      />

      {restored ? (
        <Alert variant="success" className="mb-6">
          <span className="wrap-anywhere">
            &ldquo;{restored}&rdquo; is back in the certificate list.
          </span>
        </Alert>
      ) : null}
      {erased ? (
        <Alert variant="success" className="mb-6">
          {erased === "1"
            ? "Deleted for good, with its files."
            : `${erased} certificates deleted for good, with their files.`}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <Trash2 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">The Trash is empty.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Certificates you or an uploader delete appear here, and can be restored for {TRASH_DAYS}{" "}
            days.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/admin/certificates">Go to certificates</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">
              In the Trash{" "}
              <span className="font-normal text-muted-foreground">({items.length})</span>
            </h2>
            <form action={emptyTrashAction}>
              <SubmitButton
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                pendingText="Emptying…"
                confirm={`Delete all ${items.length} certificate${items.length === 1 ? "" : "s"} in the Trash for good, with their files? This can't be undone.`}
              >
                <Trash2 /> Empty Trash
              </SubmitButton>
            </form>
          </div>

          <ul className="grid gap-3" aria-label="Deleted certificates">
            {items.map((c) => {
              const left = daysLeft(c.deleted_at);
              return (
                <li key={c.id}>
                  <Card className="gap-4 py-4">
                    <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="font-medium wrap-anywhere">{c.title}</p>
                        <p className="text-sm wrap-anywhere text-muted-foreground">
                          {c.type_name}
                          {c.report_no ? ` · No. ${c.report_no}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={left <= 3 ? "danger" : "warning"}>
                            {left === 0
                              ? "Erased today"
                              : `Erased in ${left} day${left === 1 ? "" : "s"}`}
                          </Badge>
                          <Badge variant="muted">
                            {c.files} file{c.files === 1 ? "" : "s"}
                          </Badge>
                          {c.versions > 0 ? (
                            <Badge variant="muted">
                              {c.versions} earlier version{c.versions === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm wrap-anywhere text-muted-foreground">
                          Deleted {formatDateTime(c.deleted_at)} by{" "}
                          {c.deleted_by ?? "someone removed since"} · erased on{" "}
                          {formatDate(eraseDate(c.deleted_at))}
                        </p>
                        {c.clash ? (
                          <p className="mt-1 text-sm wrap-anywhere text-destructive">
                            Can&apos;t restore yet: &ldquo;{c.clash}&rdquo; has the same report
                            number.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {c.file_id ? (
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={`/api/files/${c.file_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View file<span className="sr-only"> of {c.title}</span>
                            </a>
                          </Button>
                        ) : null}
                        <form action={restoreFromTrashAction.bind(null, c.id)}>
                          <SubmitButton variant="outline" size="sm" disabled={!!c.clash}>
                            <RotateCcw /> Restore<span className="sr-only"> {c.title}</span>
                          </SubmitButton>
                        </form>
                        <form action={eraseFromTrashAction.bind(null, c.id)}>
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            confirm={`Delete "${c.title}" for good, with its files? This can't be undone.`}
                          >
                            Delete<span className="sr-only"> {c.title}</span> for good
                          </SubmitButton>
                        </form>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
