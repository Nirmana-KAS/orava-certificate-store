import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/admin/page-header";
import { TypeWizard } from "@/components/admin/type-wizard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { listLabs, logoUrl } from "@/lib/server/labs";
import { getType } from "@/lib/server/types";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Edit certificate type" };

export default async function EditTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const type = await getType(id);
  if (!type) notFound();
  // Archived labs are offered only when this type already uses one
  const labs = (await listLabs({ includeArchived: true })).filter(
    (l) => !l.archived || l.id === type.labId,
  );

  return (
    <>
      <PageHeader
        title={type.name}
        description={`Version ${type.version}. Saving keeps the previous version.`}
      />
      {saved ? (
        <Alert variant="success" className="mb-6">
          Saved.
        </Alert>
      ) : null}
      {!type.archived ? (
        <div className="mb-6">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={`/admin/certificates/new?type=${type.id}`}>
              Add a certificate of this type
            </Link>
          </Button>
        </div>
      ) : null}
      <TypeWizard
        key={type.version}
        typeId={type.id}
        certificateCount={type.certificateCount}
        labs={labs.map((l) => ({
          id: l.id,
          shortName: l.shortName,
          name: l.name,
          logo: logoUrl(l.id, l.logoVersion),
        }))}
        initial={{
          name: type.name,
          labId: type.labId,
          category: type.category,
          description: type.description,
          icon: type.icon,
          color: type.color,
          expiryTracking: type.expiryTracking,
          expiryWarningDays: type.expiryWarningDays,
          fingerprints: type.fingerprints,
          summaryTemplate: type.summaryTemplate,
          fields: type.fields,
        }}
      />
    </>
  );
}
