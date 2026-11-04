import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ScanText } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { TypeIcon } from "@/components/admin/type-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Certificates" };

type Row = {
  id: string;
  title: string;
  report_no: string | null;
  report_date: string | null;
  weight_ct: string | null;
  summary: string;
  type_name: string;
  type_icon: string;
  type_color: string;
  files: number;
  needs_review: boolean;
};

export default async function CertificatesPage() {
  const rows = await db()<Row[]>`
    select c.id, c.title, c.report_no, to_char(c.report_date, 'DD Mon YYYY') as report_date,
      c.weight_ct::text as weight_ct, c.summary,
      t.name as type_name, t.icon as type_icon, t.color as type_color, c.needs_review,
      (select count(*)::int from certificate_files f
        where f.certificate_id = c.id and f.status = 'ready') as files
    from certificates c join certificate_types t on t.id = c.type_id
    where c.deleted_at is null
    order by c.created_at desc
    limit 200
  `;

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Add certificates from their PDFs or scans, or by hand. Searching, filtering and downloads for staff come in Phase 4."
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/admin/certificates/import">
            <ScanText /> Add from files
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/admin/certificates/new">
            <Plus /> Add by hand
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/admin/types">Certificate types</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No certificates yet. Add the first one.
        </p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="gap-3 py-4">
                <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <TypeIcon name={r.type_icon} color={r.type_color} />
                    <div className="min-w-0">
                      <p className="font-medium break-words">{r.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          r.type_name,
                          r.report_date,
                          r.weight_ct ? `${Number(r.weight_ct)} ct` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {r.summary ? <p className="mt-1 text-sm break-words">{r.summary}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.needs_review ? <Badge variant="warning">Check</Badge> : null}
                        {r.files > 0 ? (
                          <Badge variant="success">
                            {r.files} file{r.files === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <Badge variant="warning">No file yet</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/certificates/${r.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
