import { NextResponse, type NextRequest } from "next/server";

import { cronAuthorized, siteOrigin } from "@/lib/server/cron-auth";
import { env } from "@/lib/server/env";
import { checkAndRecord } from "@/lib/server/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "private, no-store" };

/**
 * Runs every health check and saves it for the System Map. cron-job.org calls it every
 * 5 minutes with the cron secret, so problems are found (and emailed) when nobody is looking.
 * Answers only the overall result, never the details.
 */
export async function GET(request: NextRequest) {
  if (!env().CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503, headers });
  }
  if (!cronAuthorized(request.headers)) {
    // Opening this address in a browser lands here: it is only for cron-job.org
    return NextResponse.json(
      {
        error: "Unauthorized",
        note: "This address is for cron-job.org, which sends the x-cron-secret header. Opening it in a browser always shows this. To check the system yourself, open the System Map in the admin area.",
      },
      { status: 401, headers },
    );
  }
  const run = await checkAndRecord("cron", siteOrigin(request.headers));
  return NextResponse.json({ overall: run.overall, ms: run.ms }, { headers });
}
