// Starts an in-memory Postgres (PGlite) for end-to-end tests, applies the real migrations and
// seeds test accounts. Run by Playwright before the app starts.
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";

import { migrate } from "../../scripts/db-migrate.ts";
import { encrypt } from "../../src/lib/server/crypto.ts";
import { hashSecret } from "../../src/lib/server/password.ts";
import { databaseUrl, E2E } from "./fixtures.ts";

const db = await PGlite.create();
const server = new PGLiteSocketServer({
  db,
  port: E2E.dbPort,
  host: "127.0.0.1",
  maxConnections: 20,
});
await server.start();

await migrate(databaseUrl, () => {});

const sql = postgres(databaseUrl, { max: 1, ssl: false, prepare: false, onnotice: () => {} });
const [admin] = await sql<{ id: string }[]>`
  insert into app_users (email, name, role) values (${E2E.admin.email}, 'Test Admin', 'admin') returning id
`;
await sql`
  insert into admin_credentials (user_id, password_hash, totp_secret_enc)
  values (${admin!.id}, ${await hashSecret(E2E.admin.password)}, ${encrypt(E2E.authSecret, E2E.admin.totpSecret)})
`;
await sql`update app_settings set passkey_hash = ${await hashSecret(E2E.passkey)}, passkey_rotated_at = now()`;
await sql`insert into app_users (email, name) values (${E2E.staff.email}, ${E2E.staff.name})`;
await sql`insert into app_users (email, status) values (${E2E.disabled.email}, 'disabled')`;
await sql.end();

await mkdir(dirname(E2E.mailFile), { recursive: true });
await rm(E2E.mailFile, { force: true });

console.log(`e2e database ready on 127.0.0.1:${E2E.dbPort}`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
