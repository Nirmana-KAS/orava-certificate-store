import type { Metadata } from "next";

import { NewCertificate } from "@/components/certificates/new-certificate";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Add certificate" };

export default async function NewCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAdmin();
  const { type } = await searchParams;
  return <NewCertificate typeId={type} area="admin" />;
}
