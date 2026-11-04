import type { Metadata } from "next";
import Link from "next/link";

import { ImportFlow, type ImportType } from "@/components/admin/import-flow";
import { PageHeader } from "@/components/admin/page-header";
import { storageConfigured } from "@/lib/server/storage";
import { listTypes } from "@/lib/server/types";

export const metadata: Metadata = { title: "Add from files" };

export default async function ImportPage() {
  const all = await listTypes();
  const types: ImportType[] = all.map((t) => ({
    id: t.id,
    name: t.name,
    lab: t.lab,
    fingerprints: t.fingerprints,
    fields: t.fields,
  }));

  return (
    <>
      <PageHeader
        title="Add from files"
        description="Choose one or more certificate PDFs or scans. Each is read, its type is found and its fields are filled in for you."
      />
      {types.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No types available.{" "}
          <Link className="underline" href="/admin/types/new">
            Create a type
          </Link>{" "}
          first.
        </p>
      ) : (
        <ImportFlow types={types} storageReady={storageConfigured()} />
      )}
    </>
  );
}
