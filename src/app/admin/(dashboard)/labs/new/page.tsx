import type { Metadata } from "next";

import { LabForm } from "@/components/admin/lab-form";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Add lab" };

export default async function NewLabPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Add lab" description="Its name, short name and logo." />
      <Card>
        <CardContent>
          <LabForm labId={null} />
        </CardContent>
      </Card>
    </>
  );
}
