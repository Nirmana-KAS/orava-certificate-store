import type { Metadata } from "next";

import { NewCertificate } from "@/components/certificates/new-certificate";
import { UploadNav } from "@/components/upload/upload-nav";
import { requireUploadModePage } from "@/lib/server/session";

export const metadata: Metadata = { title: "Add certificate" };

export default async function UploadNewCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireUploadModePage();
  const { type } = await searchParams;
  return (
    <>
      <UploadNav />
      <NewCertificate typeId={type} area="upload" />
    </>
  );
}
