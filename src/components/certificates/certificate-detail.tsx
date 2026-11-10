import { notFound } from "next/navigation";
import { z } from "zod";

import { FileText, Image as ImageIcon } from "lucide-react";

import { CertificateForm } from "@/components/admin/certificate-form";
import { FileUploader } from "@/components/admin/file-uploader";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteCertificateAction, restoreVersionAction } from "@/lib/admin/certificate-actions";
import { LabLogo } from "@/components/admin/lab-logo";
import { baseNameOf, nameIsIncomplete } from "@/lib/files/naming";
import { namePartsFor } from "@/lib/server/file-names";
import { removeFileAction } from "@/lib/admin/file-actions";
import { formatDateTime } from "@/lib/format";
import { MAX_FILES_PER_CERTIFICATE, formatBytes } from "@/lib/files/rules";
import { db } from "@/lib/server/db";
import { storageConfigured } from "@/lib/server/storage";
import type { EditorArea } from "@/lib/server/session";
import { getType } from "@/lib/server/types";
import type { EntryData } from "@/lib/types/entry";

/**
 * One certificate: its summary, files and fields, for the admin or for an uploader in upload
 * mode (the page that shows it checks who may see it). Earlier versions can be restored by the
 * admin only.
 */
export async function CertificateDetail({
  id,
  area,
  saved,
  restored,
}: {
  id: string;
  area: EditorArea;
  saved?: string;
  restored?: string;
}) {
  if (!z.uuid().safeParse(id).success) notFound();

  const [cert] = await db()<
    {
      id: string;
      type_id: string;
      title: string;
      data: EntryData;
      summary: string;
      key_points: string[];
      needs_review: boolean;
      ocr_text: string;
      extraction: { toCheck?: string[]; auto?: boolean; fileName?: string } | null;
    }[]
  >`
    select id, type_id, title, data, summary, key_points, needs_review, ocr_text, extraction
    from certificates where id = ${id} and deleted_at is null
  `;
  if (!cert) notFound();
  const type = await getType(cert.type_id);
  if (!type) notFound();
  const files = await db()<
    {
      id: string;
      kind: string;
      storage_path: string;
      original_name: string;
      size_bytes: string;
      created_at: Date;
    }[]
  >`
    select id, kind, storage_path, original_name, size_bytes::text, created_at
    from certificate_files
    where certificate_id = ${cert.id} and status = 'ready' order by created_at, id
  `;
  const nameParts = await namePartsFor(cert.id);
  // Earlier versions this certificate replaced (Replace on a duplicate report number)
  const history = await db()<
    {
      id: string;
      title: string;
      replaced_at: Date | null;
      created_at: Date;
      file_id: string | null;
    }[]
  >`
    select c.id, c.title, c.replaced_at, c.created_at,
      (select f.id from certificate_files f where f.certificate_id = c.id and f.status = 'ready'
        order by f.created_at limit 1) as file_id
    from certificates c where c.replaced_by = ${cert.id}
    order by c.replaced_at desc nulls last, c.created_at desc
  `;

  return (
    <>
      <div className="flex items-start gap-4">
        {type.labId ? (
          <LabLogo src={type.labLogo} name={type.lab} size="md" className="mt-1" />
        ) : null}
        <div className="min-w-0 flex-1">
          <PageHeader title={cert.title} description={type.name} />
        </div>
      </div>
      {saved ? (
        <Alert variant="success" className="mb-6">
          Saved.
        </Alert>
      ) : null}
      {restored ? (
        <Alert variant="success" className="mb-6">
          This version is back. The one that replaced it is kept below as history.
        </Alert>
      ) : null}

      {cert.needs_review ? (
        <Alert variant="warning" className="mb-6">
          This certificate was read automatically. Please check{" "}
          {(() => {
            const labels = (cert.extraction?.toCheck ?? [])
              .map((k) => type.fields.find((f) => f.key === k)?.label)
              .filter(Boolean);
            return labels.length ? <strong>{labels.join(", ")}</strong> : "its values";
          })()}{" "}
          below, then save. The mark goes away once you save.
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
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            The certificate as a PDF, stored privately as Report number_Date_Lab. Each view is
            logged.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {files.length > 0 ? (
            <ul className="grid gap-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {f.kind === "pdf" ? (
                      <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <ImageIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium break-all">{baseNameOf(f.storage_path)}</p>
                      <p className="text-sm break-all text-muted-foreground">
                        {f.kind.toUpperCase()} · {formatBytes(Number(f.size_bytes))} ·{" "}
                        {formatDateTime(f.created_at)}
                        {f.original_name !== baseNameOf(f.storage_path)
                          ? ` · uploaded as ${f.original_name}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer">
                        View
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/files/${f.id}?download=1`}>Download</a>
                    </Button>
                    <form action={removeFileAction.bind(null, f.id)}>
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        confirm={`Remove ${baseNameOf(f.storage_path)}? The file is deleted from storage.`}
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {nameParts && nameIsIncomplete(nameParts) ? (
            <p className="text-sm text-muted-foreground">
              Some parts of the file name are missing (report number, date or lab). Fill them in
              below and save; the files are renamed to match.
            </p>
          ) : null}
          <FileUploader
            certId={cert.id}
            disabledReason={
              !storageConfigured()
                ? "File storage isn't set up yet: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see README)."
                : files.length >= MAX_FILES_PER_CERTIFICATE
                  ? `This certificate has the most files allowed (${MAX_FILES_PER_CERTIFICATE}).`
                  : undefined
            }
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CertificateForm
            typeId={type.id}
            certId={cert.id}
            fields={type.fields}
            values={cert.data}
          />
        </CardContent>
      </Card>

      {cert.ocr_text ? (
        <details className="mb-6 rounded-xl border bg-card px-4 py-3 text-sm">
          <summary className="min-h-11 cursor-pointer content-center font-medium">
            Text read from {cert.extraction?.fileName ?? "the file"}
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto text-xs break-words whitespace-pre-wrap">
            {cert.ocr_text}
          </pre>
        </details>
      ) : null}

      {history.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Earlier versions</CardTitle>
            <CardDescription>
              {area === "admin"
                ? "Versions this certificate replaced. Restore one to make it the stored certificate again."
                : "Versions this certificate replaced. Only the admin can restore one."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium break-words">{h.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Added {formatDateTime(h.created_at)}
                      {h.replaced_at ? ` · replaced ${formatDateTime(h.replaced_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {h.file_id && area === "admin" ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/api/files/${h.file_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View file
                        </a>
                      </Button>
                    ) : null}
                    {area === "admin" ? (
                      <form action={restoreVersionAction.bind(null, h.id)}>
                        <SubmitButton
                          variant="outline"
                          size="sm"
                          confirm="Restore this version? The current one is kept here as history."
                        >
                          Restore
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <form action={deleteCertificateAction.bind(null, cert.id)}>
        <SubmitButton
          variant="outline"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
          confirm={
            area === "admin"
              ? "Delete this certificate? It disappears from the list for everyone."
              : "Delete this certificate? It disappears for everyone; only the admin can bring it back."
          }
        >
          Delete certificate
        </SubmitButton>
      </form>
    </>
  );
}
