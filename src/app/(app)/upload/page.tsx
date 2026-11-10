import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Lock, ScanText, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CertificateSearch } from "@/components/certificates/certificate-search";
import { UnlockUploadForm } from "@/components/upload/unlock-form";
import { UploadNav } from "@/components/upload/upload-nav";
import { parseFilters } from "@/lib/certificates/filters";
import { formatTime } from "@/lib/format";
import {
  getSession,
  inUploadMode,
  requireUploadModePage,
  UPLOAD_MODE_MINUTES,
} from "@/lib/server/session";
import { lockUploadAction } from "@/lib/upload/actions";

export const metadata: Metadata = { title: "Upload mode" };

export default async function UploadHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.user.role === "admin") redirect("/admin/certificates");
  if (!session.user.canUpload) redirect("/certificates");

  if (!inUploadMode(session)) {
    return (
      <>
        <PageHeader
          title="Upload mode"
          description="Adding, replacing and deleting certificates needs your personal upload passkey."
        />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Unlock upload mode</CardTitle>
            <CardDescription>
              It stays on for this sign-in until {UPLOAD_MODE_MINUTES} minutes pass without
              activity, or until you lock it. After 5 wrong tries it is locked until the admin gives
              you a new passkey.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnlockUploadForm />
          </CardContent>
        </Card>
      </>
    );
  }

  // Keeps upload mode on for another 30 minutes, like every other upload page
  const active = await requireUploadModePage();

  const filters = parseFilters(await searchParams);

  return (
    <>
      <PageHeader
        title="Upload mode"
        description="Add certificates from their PDFs or scans, or by hand, and fix their details."
      />
      <div className="mb-6 grid gap-3 rounded-xl border border-success/40 bg-success/10 p-4 sm:flex sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            Upload mode is on until {formatTime(active.user.uploadUntil!)}. Each action keeps it on
            for another {UPLOAD_MODE_MINUTES} minutes.
          </span>
        </p>
        <form action={lockUploadAction}>
          <SubmitButton variant="outline" className="w-full sm:w-auto">
            <Lock /> Lock upload mode
          </SubmitButton>
        </form>
      </div>
      <UploadNav />
      <div className="mb-6 flex flex-wrap gap-3">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/upload/import">
            <ScanText /> Add from files
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/upload/certificates/new">
            <FilePlus2 /> Add by hand
          </Link>
        </Button>
      </div>

      <CertificateSearch
        filters={filters}
        base="/upload"
        detailBase="/upload/certificates"
        showReview
      />
    </>
  );
}
