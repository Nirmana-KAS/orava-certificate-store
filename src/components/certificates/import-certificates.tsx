import Link from "next/link";

import { ImportFlow, type ImportType } from "@/components/admin/import-flow";
import { PageHeader } from "@/components/admin/page-header";
import { certificatesBase, type EditorArea } from "@/lib/server/session";
import { storageConfigured } from "@/lib/server/storage";
import { listTypes } from "@/lib/server/types";

/** "Add from files", for the admin or an uploader in upload mode. */
export async function ImportCertificates({ area }: { area: EditorArea }) {
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
          {area === "admin" ? (
            <>
              <Link className="underline" href="/admin/types/new">
                Create a type
              </Link>{" "}
              first.
            </>
          ) : (
            "Ask the admin to add one."
          )}
        </p>
      ) : (
        <ImportFlow
          types={types}
          storageReady={storageConfigured()}
          certificatesBase={certificatesBase(area)}
        />
      )}
    </>
  );
}
