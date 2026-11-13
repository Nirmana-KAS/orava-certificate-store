import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileBarChart, Minus, Upload } from "lucide-react";

import { CertificateSearch } from "@/components/certificates/certificate-search";
import { SwitchNoticePage } from "@/components/layout/switch-notice";
import { Button } from "@/components/ui/button";
import { parseFilters } from "@/lib/certificates/filters";
import { inUploadMode, requireUser } from "@/lib/server/session";
import { switchBlock, whoOf } from "@/lib/server/switches";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireUser();
  const { user } = session;
  const isAdmin = user.role === "admin";
  const filters = parseFilters(await searchParams);
  const [paused, noDownloads] = await Promise.all([
    switchBlock("search", whoOf(session)),
    switchBlock("download", whoOf(session)),
  ]);
  if (paused) return <SwitchNoticePage block={paused} what="Certificates" />;

  const access = [
    { on: true, label: "Search and open certificates" },
    { on: (isAdmin || user.canDownload) && !noDownloads, label: "Download files" },
    { on: isAdmin || user.canReport, label: "Make reports" },
    ...(user.canUpload ? [{ on: true, label: "Add and change certificates" }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Certificates</h1>
          <p className="mt-1 wrap-anywhere text-muted-foreground">Signed in as {user.email}</p>
          <ul aria-label="What you can do" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {access.map((a) => (
              <li
                key={a.label}
                className={`flex items-center gap-1.5 ${a.on ? "" : "text-muted-foreground line-through"}`}
              >
                {a.on ? (
                  <Check className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <Minus className="size-4" aria-hidden="true" />
                )}
                <span>
                  <span className="sr-only">{a.on ? "Allowed: " : "Not allowed: "}</span>
                  {a.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
          {user.canReport ? (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/reports">
                <FileBarChart /> Make a report
              </Link>
            </Button>
          ) : null}
          {user.canUpload ? (
            <Button asChild className="w-full sm:w-auto">
              <Link href="/upload">
                <Upload /> {inUploadMode(session) ? "Go to upload mode" : "Unlock upload mode"}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <CertificateSearch filters={filters} base="/certificates" detailBase="/certificates" />
    </div>
  );
}
