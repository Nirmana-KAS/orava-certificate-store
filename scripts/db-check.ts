// Times the database connection so slow pages can be traced. Usage: pnpm db:check
// Prints the host and port only, never the password.
import { lookup } from "node:dns/promises";
import { connect } from "node:net";

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const { hostname, port } = new URL(url);
const portNum = Number(port) || 5432;
const ms = (start: number) => `${Math.round(performance.now() - start)} ms`;

console.log(`Host: ${hostname}`);
console.log(
  `Port: ${portNum} ${portNum === 6543 ? "(transaction pooler, correct)" : "(expected 6543, the transaction pooler)"}`,
);

let t = performance.now();
const addresses = await lookup(hostname, { all: true });
console.log(`DNS: ${addresses.map((a) => `${a.address} (IPv${a.family})`).join(", ")} in ${ms(t)}`);

for (const { address, family } of addresses) {
  t = performance.now();
  const result = await new Promise<string>((done) => {
    const socket = connect({ host: address, port: portNum, family, timeout: 8000 });
    socket.once("connect", () => done(`ok in ${ms(t)}`));
    socket.once("timeout", () => done("TIMED OUT after 8 s"));
    socket.once("error", (e) => done(`failed: ${e.message}`));
  });
  console.log(`Network to ${address}: ${result}`);
}

const sql = postgres(url, {
  max: 3,
  ssl: "require",
  prepare: false,
  connect_timeout: 15,
  onnotice: () => {},
});
try {
  t = performance.now();
  await sql`select 1`;
  console.log(`First query (includes sign-in to the database): ${ms(t)}`);

  const times: string[] = [];
  for (let i = 0; i < 5; i++) {
    t = performance.now();
    await sql`select 1`;
    times.push(ms(t));
  }
  console.log(`5 queries one after another: ${times.join(", ")}`);

  // A second connection opened while the first is still open: this is what stalled the pages.
  const second = postgres(url, { max: 1, ssl: "require", prepare: false, onnotice: () => {} });
  t = performance.now();
  const outcome = await Promise.race([
    second`select 1`.then(() => `ok in ${ms(t)}`),
    new Promise<string>((done) => setTimeout(() => done("STALLED (no answer after 20 s)"), 20_000)),
  ]).catch((e: Error) => `failed: ${e.message}`);
  console.log(`Second connection at the same time: ${outcome}`);
  void second.end({ timeout: 1 }).catch(() => {});

  // Several queries at once on ONE connection (pipelining): what the pages did before the fix.
  const piped = postgres(url, { max: 1, ssl: "require", prepare: false, onnotice: () => {} });
  await piped`select 1`;
  t = performance.now();
  const pipedOutcome = await Promise.race([
    Promise.all([piped`select 1`, piped`select 2`, piped`select 3`]).then(() => `ok in ${ms(t)}`),
    new Promise<string>((done) => setTimeout(() => done("STALLED (no answer after 20 s)"), 20_000)),
  ]).catch((e: Error) => `failed: ${e.message}`);
  console.log(`3 queries at once on one connection (old way): ${pipedOutcome}`);
  void piped.end({ timeout: 1 }).catch(() => {});

  // The same with pipelining off, as the app does now.
  const fixed = postgres(url, {
    max: 1,
    max_pipeline: 1,
    ssl: "require",
    prepare: false,
    onnotice: () => {},
  });
  await fixed`select 1`;
  t = performance.now();
  const fixedOutcome = await Promise.race([
    Promise.all([fixed`select 1`, fixed`select 2`, fixed`select 3`]).then(() => `ok in ${ms(t)}`),
    new Promise<string>((done) => setTimeout(() => done("STALLED (no answer after 20 s)"), 20_000)),
  ]).catch((e: Error) => `failed: ${e.message}`);
  console.log(`3 queries at once, one at a time (new way): ${fixedOutcome}`);
  void fixed.end({ timeout: 1 }).catch(() => {});

  t = performance.now();
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from app_users`;
  console.log(`Read app_users (${row?.n ?? 0} rows): ${ms(t)}`);
  console.log("\nDone. Send this output to Claude.");
} catch (e) {
  console.error(`\nDatabase error: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
// A stalled test connection must not keep the script running.
process.exit(process.exitCode ?? 0);
