import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";

import { LabLogo } from "@/components/admin/lab-logo";
import { PageHeader } from "@/components/admin/page-header";
import { TypeIcon } from "@/components/admin/type-icon";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setTypeArchivedAction } from "@/lib/admin/type-actions";
import { CATEGORY_LABELS } from "@/lib/labs";
import { listTypes } from "@/lib/server/types";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Certificate types" };

export default async function TypesPage() {
  await requireAdmin();
  const types = await listTypes({ includeArchived: true });

  return (
    <>
      <PageHeader
        title="Certificate types"
        description="Each type decides which details are recorded for a certificate. Add a new type any time, no code needed."
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/admin/types/new">
            <Plus /> New type
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/admin/labs">
            <FlaskConical /> Labs and logos
          </Link>
        </Button>
      </div>

      {types.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No types yet. Create the first one.
        </p>
      ) : (
        <ul className="grid gap-3">
          {types.map((t) => (
            <li key={t.id}>
              <Card className="gap-4 py-4">
                <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    {t.labId ? (
                      <LabLogo src={t.labLogo} name={t.lab} />
                    ) : (
                      <TypeIcon name={t.icon} color={t.color} />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium break-words">{t.name}</p>
                      {t.description ? (
                        <p className="text-sm text-muted-foreground">{t.description}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {t.lab ? <Badge>{t.lab}</Badge> : null}
                        {t.category ? (
                          <Badge variant="muted">{CATEGORY_LABELS[t.category]}</Badge>
                        ) : null}
                        <Badge variant="muted">{t.fields.length} fields</Badge>
                        <Badge variant="muted">
                          {t.certificateCount} certificate{t.certificateCount === 1 ? "" : "s"}
                        </Badge>
                        {t.archived ? <Badge variant="warning">Archived</Badge> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/types/${t.id}`}>Edit</Link>
                    </Button>
                    <form action={setTypeArchivedAction.bind(null, t.id, !t.archived)}>
                      <SubmitButton
                        variant="outline"
                        size="sm"
                        confirm={
                          t.archived
                            ? undefined
                            : `Archive ${t.name}? It is hidden from new uploads. Existing certificates stay.`
                        }
                      >
                        {t.archived ? "Restore" : "Archive"}
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
