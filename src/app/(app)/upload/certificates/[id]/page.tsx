import type { Metadata } from "next";

import { CertificateDetail } from "@/components/certificates/certificate-detail";
import { UploadNav } from "@/components/upload/upload-nav";
import { requireUploadModePage } from "@/lib/server/session";

export const metadata: Metadata = { title: "Edit certificate" };

export default async function UploadCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireUploadModePage();
  const { id } = await params;
  const { saved } = await searchParams;
  return (
    <>
      <UploadNav />
      <CertificateDetail id={id} area="upload" saved={saved} />
    </>
  );
}
