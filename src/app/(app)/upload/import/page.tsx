import type { Metadata } from "next";

import { ImportCertificates } from "@/components/certificates/import-certificates";
import { SwitchNotice } from "@/components/layout/switch-notice";
import { UploadNav } from "@/components/upload/upload-nav";
import { requireUploadModePage } from "@/lib/server/session";
import { switchBlock, whoOf } from "@/lib/server/switches";

export const metadata: Metadata = { title: "Add from files" };

export default async function UploadImportPage() {
  const session = await requireUploadModePage();
  const paused = await switchBlock("extract", whoOf(session));
  return (
    <>
      <UploadNav />
      {paused ? (
        <SwitchNotice block={paused} what="Reading files" />
      ) : (
        <ImportCertificates area="upload" />
      )}
    </>
  );
}
