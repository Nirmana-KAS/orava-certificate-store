import { NextResponse } from "next/server";

import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { bucketStatus, storageConfigured } from "@/lib/server/storage";

// Anyone gets only "ok" or "error". The signed-in admin also sees the details: yes/no for each
// setting (never a value), the region, the database host and timings, and file storage.
export const dynamic = "force-dynamic";

const REQUIRED = ["DATABASE_URL", "AUTH_SECRET", "ADMIN_EMAIL"] as const;
const OPTIONAL = [
  "ADMIN_SETUP_TOKEN",
  "SMTP_USER",
  "SMTP_APP_PASSWORD",
  "NEXT_PUBLIC_SITE_URL",
] as const;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`no answer after ${ms / 1000} s`)), ms),
    ),
  ]);
}

export async function GET() {
  const present = (name: string) => Boolean(process.env[name]);
  const checks: Record<string, unknown> = {
    region: process.env.VERCEL_REGION ?? "local",
    node: process.version,
    required: Object.fromEntries(REQUIRED.map((n) => [n, present(n)])),
    optional: Object.fromEntries(OPTIONAL.map((n) => [n, present(n)])),
    authSecretLongEnough: (process.env.AUTH_SECRET?.length ?? 0) >= 32,
  };

  try {
    const url = process.env.DATABASE_URL;
    if (url) {
      const { hostname, port } = new URL(url);
      checks.databaseHost = `${hostname}:${port}`;
    }
  } catch {
    checks.databaseUrlFormat =
      "DATABASE_URL is not a valid URL (a symbol in the password may need encoding)";
  }

  const started = performance.now();
  try {
    await withTimeout(db()`select 1`, 15_000);
    checks.database = `ok in ${Math.round(performance.now() - started)} ms`;
    const [row] = await withTimeout(
      db()<{ n: number }[]>`select count(*)::int as n from admin_credentials`,
      15_000,
    );
    checks.adminAccountExists = (row?.n ?? 0) > 0;
  } catch (e) {
    checks.database = `FAILED: ${(e as Error).message}`;
  }

  if (storageConfigured()) {
    try {
      const b = await withTimeout(bucketStatus(), 15_000);
      checks.fileStorage = !b.exists
        ? "ok (bucket is created on the first upload)"
        : b.private
          ? "ok (private bucket)"
          : "WARNING: bucket is public; it is made private again on the next upload";
    } catch (e) {
      checks.fileStorage = `FAILED: ${(e as Error).message.slice(0, 200)}`;
    }
  } else {
    checks.fileStorage = "not set up (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)";
  }

  const ok = typeof checks.database === "string" && checks.database.startsWith("ok");
  const session = await getSession().catch(() => null);
  const body = session?.user.role === "admin" ? checks : { status: ok ? "ok" : "error" };
  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
