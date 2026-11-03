import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { TypeWizard } from "@/components/admin/type-wizard";

export const metadata: Metadata = { title: "New certificate type" };

export default function NewTypePage() {
  return (
    <>
      <PageHeader title="New certificate type" description="Four short steps." />
      <TypeWizard typeId={null} initial={null} certificateCount={0} />
    </>
  );
}
