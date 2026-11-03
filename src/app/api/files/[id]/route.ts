import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ALLOWED_TYPES } from "@/lib/files/rules";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { getSession } from "@/lib/server/session";
import { signedDownloadUrl } from "@/lib/server/storage";
import { slugify } from "@/lib/types/schema";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const notFound = () => new NextResponse("Not found", { status: 404, headers: noStore });

/**
 * Opens (or with ?download=1, saves) one file. Checks who is asking, logs it, then sends the
 * browser to a storage link that stops working after 60 seconds.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  // Staff access (for those allowed to download) arrives with the staff pages in Phase 4
  if (!session || session.user.role !== "admin") return notFound();

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const [file] = await db()<
    {
      storage_path: string;
      mime: keyof typeof ALLOWED_TYPES;
      original_name: string;
      title: string;
      certificate_id: string;
    }[]
  >`
    select f.storage_path, f.mime, f.original_name, c.title, c.id as certificate_id
    from certificate_files f join certificates c on c.id = f.certificate_id
    where f.id = ${id} and f.status = 'ready' and c.deleted_at is null
  `;
  if (!file) return notFound();

  const download = request.nextUrl.searchParams.get("download") === "1";
  const name = `${slugify(file.title)}.${ALLOWED_TYPES[file.mime]?.ext ?? "bin"}`;
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
