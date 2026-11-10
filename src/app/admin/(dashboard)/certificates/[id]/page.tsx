import type { Metadata } from "next";

import { CertificateDetail } from "@/components/certificates/certificate-detail";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Edit certificate" };

export default async function EditCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; restored?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved, restored } = await searchParams;
  return <CertificateDetail id={id} area="admin" saved={saved} restored={restored} />;
}
