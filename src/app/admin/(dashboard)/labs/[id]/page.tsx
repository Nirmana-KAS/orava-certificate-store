import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { LabForm } from "@/components/admin/lab-form";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getLab, logoUrl } from "@/lib/server/labs";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Edit lab" };

export default async function EditLabPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const lab = await getLab(id);
  if (!lab) notFound();
  return (
    <>
      <PageHeader
        title={lab.name}
        description="Changing the short name renames this lab's types and stored files to match."
      />
      <Card>
        <CardContent>
          <LabForm
            labId={lab.id}
            initial={{
              name: lab.name,
              shortName: lab.shortName,
              website: lab.website,
              logoSrc: logoUrl(lab.id, lab.logoVersion),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
