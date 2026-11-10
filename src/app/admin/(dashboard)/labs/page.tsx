import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { LabLogo } from "@/components/admin/lab-logo";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setLabArchivedAction } from "@/lib/admin/lab-actions";
import { listLabs, logoUrl } from "@/lib/server/labs";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Labs" };

export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { saved } = await searchParams;
  const labs = await listLabs({ includeArchived: true });

  return (
    <>
      <PageHeader
        title="Labs"
        description="The laboratories that issue your certificates. Each certificate type belongs to a lab, and the lab's short name goes into every file name."
      />
      {saved ? (
        <Alert variant="success" className="mb-6">
          Saved.
        </Alert>
      ) : null}
      <div className="mb-6 flex flex-wrap gap-3">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/admin/labs/new">
            <Plus /> Add lab
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/admin/types">Certificate types</Link>
        </Button>
      </div>

      {labs.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No labs yet. Add the first one.
        </p>
      ) : (
        <ul className="grid gap-3">
          {labs.map((l) => (
            <li key={l.id}>
              <Card className="gap-4 py-4">
                <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <LabLogo src={logoUrl(l.id, l.logoVersion)} name={l.shortName} />
                    <div className="min-w-0">
                      <p className="font-medium break-words">{l.name}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge>{l.shortName}</Badge>
                        <Badge variant="muted">
                          {l.typeCount} type{l.typeCount === 1 ? "" : "s"}
                        </Badge>
                        {l.archived ? <Badge variant="warning">Archived</Badge> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/labs/${l.id}`}>Edit</Link>
                    </Button>
                    <form action={setLabArchivedAction.bind(null, l.id, !l.archived)}>
                      <SubmitButton
                        variant="outline"
                        size="sm"
                        confirm={
                          l.archived
                            ? undefined
                            : `Archive ${l.name}? It can't be chosen for new types. Existing types and certificates stay.`
                        }
                      >
                        {l.archived ? "Restore" : "Archive"}
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
