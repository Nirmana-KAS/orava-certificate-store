import { NextResponse } from "next/server";

import { db } from "@/lib/server/db";

// Safe to open in a browser: it reports only yes/no for settings, never a value.
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

  const ok = typeof checks.database === "string" && checks.database.startsWith("ok");
  return NextResponse.json(checks, { status: ok ? 200 : 503 });
}
