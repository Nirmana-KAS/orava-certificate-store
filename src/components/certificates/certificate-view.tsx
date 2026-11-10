import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Download, ExternalLink, FileText, Pencil } from "lucide-react";

import { LabLogo } from "@/components/admin/lab-logo";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { baseNameOf } from "@/lib/files/naming";
import { formatBytes } from "@/lib/files/rules";
import { db } from "@/lib/server/db";
import { getType } from "@/lib/server/types";
import type { EntryData, EntryValue } from "@/lib/types/entry";
import type { FieldDef } from "@/lib/types/schema";

/**
 * One certificate for reading: its details, summary and files. Download buttons only show for
 * people who may download (the file link checks this again on the server).
 */
export async function CertificateView({
  id,
  backHref,
  canDownload,
  editHref,
}: {
  id: string;
  backHref: string;
  canDownload: boolean;
  /** For uploaders and the admin: where to change it */
  editHref?: string;
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
    }[]
  >`
    select id, type_id, title, data, summary, key_points
    from certificates where id = ${id} and deleted_at is null
  `;
  if (!cert) notFound();
  const type = await getType(cert.type_id);
  if (!type) notFound();
  const files = await db()<{ id: string; storage_path: string; size_bytes: string }[]>`
    select id, storage_path, size_bytes::text from certificate_files
    where certificate_id = ${cert.id} and status = 'ready' order by created_at, id
  `;

  const simple = type.fields.filter((f) => f.kind !== "table" && hasValue(cert.data[f.key]));
  const tables = type.fields.filter((f) => f.kind === "table" && hasValue(cert.data[f.key]));

  return (
    <>
      <Button asChild variant="ghost" className="mb-4 -ml-3">
        <Link href={backHref}>
          <ArrowLeft /> Back to the list
        </Link>
      </Button>
      <div className="flex items-start gap-4">
        {type.labId ? (
          <LabLogo src={type.labLogo} name={type.lab} size="md" className="mt-1" />
        ) : null}
        <div className="min-w-0 flex-1">
          <PageHeader title={cert.title} description={type.name} />
        </div>
      </div>
      {editHref ? (
        <Button asChild variant="outline" className="mb-6 w-full sm:w-auto">
          <Link href={editHref}>
            <Pencil /> Edit this certificate
          </Link>
        </Button>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            {canDownload
              ? "Open the certificate in a new tab, or download it. Each view and download is logged."
              : "Open the certificate in a new tab. Each view is logged. Ask the admin if you need to download it."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No file has been added yet.</p>
          ) : (
            <ul className="grid gap-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium wrap-anywhere">{baseNameOf(f.storage_path)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatBytes(Number(f.size_bytes))}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Open PDF
                      </a>
                    </Button>
                    {canDownload ? (
                      <Button asChild size="sm">
                        <a href={`/api/files/${f.id}?download=1`}>
                          <Download /> Download
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          {simple.length === 0 ? (
            <p className="text-sm text-muted-foreground">No details have been filled in.</p>
          ) : (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {simple.map((f) => (
                <div key={f.key} className={f.kind === "longtext" ? "sm:col-span-2" : undefined}>
                  <dt className="text-sm text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium break-words whitespace-pre-line">
                    {show(f, cert.data[f.key])}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {tables.map((f) => {
        const rows = cert.data[f.key] as Record<string, string | number | null>[];
        const cols = f.columns ?? [];
        return (
          <Card key={f.key} className="mb-6">
            <CardHeader>
              <CardTitle>{f.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={f.label}>
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      {cols.map((c) => (
                        <th key={c.key} scope="col" className="px-2 py-2 font-medium">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {cols.map((c) => (
                          <td key={c.key} className="px-2 py-2">
                            {row[c.key] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

function hasValue(v: EntryValue | undefined): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function show(f: FieldDef, v: EntryValue | undefined): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (f.kind === "carat" && typeof v === "number") return `${v} ct`;
  if (f.kind === "date" && typeof v === "string") {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  }
  return String(v ?? "");
}
