// Applies supabase/migrations/*.sql in order, once each. Usage: pnpm db:migrate
// Reads DATABASE_URL from the environment or .env.local.
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import postgres from "postgres";

export async function migrate(
  url: string,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const sql = postgres(url, {
    max: 1,
    ssl: local ? false : "require",
    prepare: false,
    onnotice: () => {},
  });
  try {
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;
    const dir = join(import.meta.dirname, "..", "supabase", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
    );

    for (const file of files) {
      if (done.has(file)) continue;
      const text = await readFile(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }
    log("database is up to date");
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  await migrate(url);
}
