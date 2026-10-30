import type { Metadata } from "next";
import { FileSearch } from "lucide-react";

import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const { user } = await requireUser();

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Certificates</h1>
      <p className="mt-1 text-muted-foreground">Signed in as {user.email}</p>

      <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
        <FileSearch className="size-10 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold">No certificates yet</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Search, filters and downloads appear here once the admin uploads certificates.
        </p>
      </div>
    </div>
  );
}
