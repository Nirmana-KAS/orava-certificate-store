import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CertificateView } from "@/components/certificates/certificate-view";
import { SwitchNoticePage } from "@/components/layout/switch-notice";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireUser } from "@/lib/server/session";
import { switchBlock, whoOf } from "@/lib/server/switches";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Logs that staff opened a certificate, once per sign-in every 10 minutes (the page also
 * reloads itself when data changes, which shouldn't count as another visit).
 */
async function logView(session: { id: string; user: { id: string; email: string } }, id: string) {
  if (!UUID.test(id)) return;
  const [row] = await db()<{ name: string | null; seen: boolean }[]>`
    select coalesce(c.report_no, c.title) as name,
      exists (select 1 from audit_logs a where a.session_id = ${session.id}
              and a.action = 'certificate.view' and a.meta->>'id' = ${id}
              and a.at > now() - interval '10 minutes') as seen
    from certificates c where c.id = ${id} and c.deleted_at is null
  `;
  if (!row || row.seen) return;
  await audit(
    { id: session.user.id, email: session.user.email, sessionId: session.id },
    "certificate.view",
    await clientInfo(),
    row.name,
    { id },
  );
}

export const metadata: Metadata = { title: "Certificate" };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { user } = session;
  const { id } = await params;
  if (user.role === "admin") redirect(`/admin/certificates/${id}`);
  const [cert] = UUID.test(id)
    ? await db()<{ type_id: string }[]>`select type_id from certificates where id = ${id}`
    : [];
  const who = whoOf(session);
  const [paused, noDownloads] = await Promise.all([
    switchBlock("view", who, cert?.type_id),
    switchBlock("download", who, cert?.type_id),
  ]);
  if (paused) return <SwitchNoticePage block={paused} what="This certificate" />;
  await logView(session, id);
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <CertificateView
        id={id}
        backHref="/certificates"
        canDownload={user.canDownload && !noDownloads}
        editHref={user.canUpload ? `/upload/certificates/${id}` : undefined}
      />
    </div>
  );
}
