import type { Metadata } from "next";

import { ImportCertificates } from "@/components/certificates/import-certificates";
import { UploadNav } from "@/components/upload/upload-nav";
import { requireUploadModePage } from "@/lib/server/session";

export const metadata: Metadata = { title: "Add from files" };

export default async function UploadImportPage() {
  await requireUploadModePage();
  return (
    <>
      <UploadNav />
      <ImportCertificates area="upload" />
    </>
  );
}
