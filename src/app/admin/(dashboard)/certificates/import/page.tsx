import type { Metadata } from "next";

import { ImportCertificates } from "@/components/certificates/import-certificates";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Add from files" };

export default async function ImportPage() {
  await requireAdmin();
  return <ImportCertificates area="admin" />;
}
