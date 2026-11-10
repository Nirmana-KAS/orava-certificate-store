import type { Metadata } from "next";
import Link from "next/link";
import { FilePen, Plus, ScanText } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { CertificateSearch } from "@/components/certificates/certificate-search";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { parseFilters } from "@/lib/certificates/filters";
import { renameStoredFilesAction } from "@/lib/admin/certificate-actions";
import { certificatesWithOldNames } from "@/lib/server/file-names";
import { storageConfigured } from "@/lib/server/storage";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const filters = parseFilters(await searchParams);
  // Files stored before the ReportNo_Date_Lab names (or whose details changed since)
  const oldNames = storageConfigured() ? (await certificatesWithOldNames()).length : 0;

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Add certificates from their PDFs or scans, or by hand, and find them again."
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

      {oldNames > 0 ? (
        <div className="mb-6 grid gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">
              {oldNames} certificate{oldNames === 1 ? " has" : "s have"} files with old names.
            </span>{" "}
            Rename them to the standard Report number_Date_Lab names.
          </p>
          <form action={renameStoredFilesAction}>
            <SubmitButton variant="outline" className="w-full sm:w-auto" pendingText="Renaming…">
              <FilePen /> Rename files
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <CertificateSearch
        filters={filters}
        base="/admin/certificates"
        detailBase="/admin/certificates"
        showReview
      />
    </>
  );
}
