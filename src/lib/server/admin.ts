import "server-only";

import { db } from "./db";

export async function adminExists(): Promise<boolean> {
  const rows = await db()`select 1 from app_users where role = 'admin' limit 1`;
  return rows.length > 0;
}
