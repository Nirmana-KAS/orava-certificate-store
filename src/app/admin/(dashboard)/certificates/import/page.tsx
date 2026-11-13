import type { Metadata } from "next";

import { ImportCertificates } from "@/components/certificates/import-certificates";
import { SwitchNotice } from "@/components/layout/switch-notice";
import { requireAdmin } from "@/lib/server/session";
import { switchBlock, whoOf } from "@/lib/server/switches";

export const metadata: Metadata = { title: "Add from files" };

export default async function ImportPage() {
  const session = await requireAdmin();
  // Only when the admin chose "also stop my own uploads" in the Control Center
  const paused =
    (await switchBlock("upload", whoOf(session))) ?? (await switchBlock("extract", whoOf(session)));
  if (paused) return <SwitchNotice block={paused} what="Reading files" />;
  return <ImportCertificates area="admin" />;
}
