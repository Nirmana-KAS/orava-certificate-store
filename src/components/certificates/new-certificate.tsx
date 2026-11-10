import Link from "next/link";
import { z } from "zod";

import { CertificateForm } from "@/components/admin/certificate-form";
import { PageHeader } from "@/components/admin/page-header";
import { LabLogo } from "@/components/admin/lab-logo";
import { TypeIcon } from "@/components/admin/type-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { certificatesBase, type EditorArea } from "@/lib/server/session";
import { getType, listTypes } from "@/lib/server/types";

/** Choose a type, then fill in its form. For the admin or an uploader in upload mode. */
export async function NewCertificate({ typeId, area }: { typeId?: string; area: EditorArea }) {
  const base = certificatesBase(area);

  if (typeId && z.uuid().safeParse(typeId).success) {
    const type = await getType(typeId);
    if (type && !type.archived) {
      return (
        <>
          <PageHeader title={`Add ${type.name}`} description="Fields marked * are required." />
          <Card>
            <CardContent>
              <CertificateForm typeId={type.id} certId={null} fields={type.fields} values={{}} />
            </CardContent>
          </Card>
        </>
      );
    }
  }

  const types = await listTypes();
  return (
    <>
      <PageHeader title="Add certificate" description="Which type of certificate is it?" />
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
        <ul className="grid gap-3 md:grid-cols-2">
          {types.map((t) => (
            <li key={t.id}>
              <Button
                asChild
                variant="outline"
                className="h-auto w-full justify-start gap-3 py-3 text-left whitespace-normal"
              >
                <Link href={`${base}/new?type=${t.id}`}>
                  {t.labId ? (
                    <LabLogo src={t.labLogo} name={t.lab} size="sm" />
                  ) : (
                    <TypeIcon name={t.icon} color={t.color} />
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium break-words">{t.name}</span>
                    {t.lab ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t.lab}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
