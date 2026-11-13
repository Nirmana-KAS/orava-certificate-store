import type { Metadata } from "next";

import { NewCertificate } from "@/components/certificates/new-certificate";
import { SwitchNotice } from "@/components/layout/switch-notice";
import { requireAdmin } from "@/lib/server/session";
import { switchBlock, whoOf } from "@/lib/server/switches";

export const metadata: Metadata = { title: "Add certificate" };

export default async function NewCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await requireAdmin();
  // Only when the admin chose "also stop my own uploads" in the Control Center
  const paused = await switchBlock("upload", whoOf(session));
  if (paused) return <SwitchNotice block={paused} what="Your uploads" />;
  const { type } = await searchParams;
  return <NewCertificate typeId={type} area="admin" />;
}
