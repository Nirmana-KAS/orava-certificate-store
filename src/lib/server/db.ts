import "server-only";

import postgres from "postgres";

import { env } from "./env";

type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as { __oravaSql?: Sql };

function connect(): Sql {
  const url = env().DATABASE_URL;
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  return postgres(url, {
    // Supabase pooler (transaction mode) friendly; few connections per serverless instance
    max: Number(process.env.DATABASE_POOL_MAX) || (local ? 5 : 3),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : "require",
    prepare: false,
    onnotice: () => {},
  });
}

/** Shared Postgres client (server only). Uses tagged templates, so values are always parameterised. */
export function db(): Sql {
  globalForDb.__oravaSql ??= connect();
  return globalForDb.__oravaSql;
}
