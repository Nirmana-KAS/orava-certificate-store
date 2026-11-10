import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CertificateView } from "@/components/certificates/certificate-view";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Certificate" };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  if (user.role === "admin") redirect(`/admin/certificates/${id}`);
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <CertificateView
        id={id}
        backHref="/certificates"
        canDownload={user.canDownload}
        editHref={user.canUpload ? `/upload/certificates/${id}` : undefined}
      />
    </div>
  );
}
