import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CertificateForm } from "@/components/admin/certificate-form";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteCertificateAction } from "@/lib/admin/certificate-actions";
import { db } from "@/lib/server/db";
import { getType } from "@/lib/server/types";
import type { EntryData } from "@/lib/types/entry";

export const metadata: Metadata = { title: "Edit certificate" };

export default async function EditCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const [cert] = await db()<
    {
      id: string;
      type_id: string;
      title: string;
      data: EntryData;
      summary: string;
      key_points: string[];
    }[]
  >`
    select id, type_id, title, data, summary, key_points
    from certificates where id = ${id} and deleted_at is null
  `;
  if (!cert) notFound();
  const type = await getType(cert.type_id);
  if (!type) notFound();

  return (
    <>
      <PageHeader title={cert.title} description={type.name} />
      {saved ? (
        <Alert variant="success" className="mb-6">
          Saved.
        </Alert>
      ) : null}

      {cert.summary || cert.key_points.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {cert.summary ? <p className="break-words">{cert.summary}</p> : null}
            {cert.key_points.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {cert.key_points.map((p) => (
                  <li key={p} className="break-words">
                    {p}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardContent>
          <CertificateForm
            typeId={type.id}
            certId={cert.id}
            fields={type.fields}
            values={cert.data}
          />
        </CardContent>
      </Card>

      <form action={deleteCertificateAction.bind(null, cert.id)}>
        <SubmitButton
          variant="outline"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
          confirm="Delete this certificate? It disappears from the list for everyone."
        >
          Delete certificate
        </SubmitButton>
      </form>
    </>
  );
}
