import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { TypeWizard } from "@/components/admin/type-wizard";
import { listLabs, logoUrl } from "@/lib/server/labs";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "New certificate type" };

export default async function NewTypePage() {
  await requireAdmin();
  const labs = await listLabs();
  return (
    <>
      <PageHeader title="New certificate type" description="Four short steps." />
      <TypeWizard
        typeId={null}
        initial={null}
        certificateCount={0}
        labs={labs.map((l) => ({
          id: l.id,
          shortName: l.shortName,
          name: l.name,
          logo: logoUrl(l.id, l.logoVersion),
        }))}
      />
    </>
  );
}
