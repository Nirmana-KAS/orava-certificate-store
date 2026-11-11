import { NextResponse, type NextRequest } from "next/server";

import { backupFiles, backupPage, isBackupTable } from "@/lib/server/backup";
import { getSession } from "@/lib/server/session";
import { storageConfigured } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * One page of a backup, for the admin's browser: ?part=table&name=certificates&after=… or
 * ?part=files&after=…. Admin only. The start and the end of each backup are logged.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session?.user.role !== "admin") {
    return new NextResponse("Not found", { status: 404, headers });
  }
  const p = request.nextUrl.searchParams;
  const after = p.get("after") || null;
  if (after && !/^[0-9a-f-]{1,36}(:\d{1,9})?$/i.test(after)) {
    return NextResponse.json({ error: "Bad cursor" }, { status: 400, headers });
  }
  try {
    if (p.get("part") === "table") {
      const name = p.get("name") ?? "";
      if (!isBackupTable(name)) {
        return NextResponse.json({ error: "Unknown table" }, { status: 400, headers });
      }
      return NextResponse.json(await backupPage(name, after), { headers });
    }
    if (p.get("part") === "files") {
      if (!storageConfigured()) {
        return NextResponse.json({ error: "File storage is not set up" }, { status: 503, headers });
      }
      return NextResponse.json(await backupFiles(after), { headers });
    }
  } catch (error) {
    console.error("backup page failed", error);
    return NextResponse.json(
      { error: "The server couldn't read this part. Please try again." },
      {
        status: 503,
        headers,
      },
    );
  }
  return NextResponse.json({ error: "Unknown part" }, { status: 400, headers });
}
