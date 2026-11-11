import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { baseNameOf } from "@/lib/files/naming";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { getSession, inUploadMode } from "@/lib/server/session";
import { signedDownloadUrl } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const notFound = () => new NextResponse("Not found", { status: 404, headers: noStore });

/**
 * Opens (or with ?download=1, saves) one file. Checks who is asking, logs it, then sends the
 * browser to a storage link that stops working after 60 seconds.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  // Every signed-in person may open a live certificate's file. Saving it (?download=1) needs
  // the Download permission, or the admin, or an uploader in upload mode.
  if (!session) return notFound();
  const isAdmin = session.user.role === "admin";
  const download = request.nextUrl.searchParams.get("download") === "1";
  if (download && !isAdmin && !session.user.canDownload && !inUploadMode(session)) {
    return new NextResponse("You don't have permission to download files.", {
      status: 403,
      headers: noStore,
    });
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const [file] = await db()<
    {
      storage_path: string;
      original_name: string;
      title: string;
      certificate_id: string;
    }[]
  >`
    select f.storage_path, f.original_name, c.title, c.id as certificate_id
    from certificate_files f join certificates c on c.id = f.certificate_id
    where f.id = ${id} and f.status = 'ready'
      -- certificates in the Trash, and earlier versions kept after a Replace, can still be
      -- opened by the admin
      and (c.deleted_at is null or ${isAdmin})
  `;
  if (!file) return notFound();

  // Saved as ReportNo_Date_Lab.pdf, the name it is stored under
  const name = baseNameOf(file.storage_path);
  try {
    const url = await signedDownloadUrl(file.storage_path, 60, download ? name : undefined);
    await audit(
      { id: session.user.id, email: session.user.email },
      download ? "file.download" : "file.view",
      await clientInfo(),
      file.original_name,
      { certificate: file.certificate_id },
    );
    return NextResponse.redirect(url, { status: 303, headers: noStore });
  } catch (error) {
    console.error("signed link failed", error);
    return new NextResponse("File storage didn't answer. Please try again.", {
      status: 503,
      headers: noStore,
    });
  }
}
