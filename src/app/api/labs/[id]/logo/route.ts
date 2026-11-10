import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * A lab's logo. Logos are not secret (they are printed on every report), so no sign-in is needed.
 * Only images checked on upload are stored, and they are sent so a browser can never run them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const [row] = await db()<{ logo: Uint8Array; logo_mime: string }[]>`
    select logo, logo_mime from labs where id = ${id} and logo is not null
  `;
  if (!row) return new NextResponse("Not found", { status: 404 });
  const versioned = request.nextUrl.searchParams.has("v");
  return new NextResponse(Buffer.from(row.logo), {
    headers: {
      "Content-Type": row.logo_mime,
      "Content-Length": String(row.logo.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // The address changes with every new logo, so a versioned one can be kept for a year
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}
