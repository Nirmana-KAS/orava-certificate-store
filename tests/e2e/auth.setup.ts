import { join } from "node:path";

import { test as setup } from "@playwright/test";

import { E2E } from "./fixtures";
import { completeEmailCode, signInAdmin, signInStaff } from "./helpers";

setup("sign in as staff", async ({ page }) => {
  await signInStaff(page);
  await completeEmailCode(page);
  await page.context().storageState({ path: join(E2E.authDir, "staff.json") });
});

setup("sign in as admin", async ({ page }) => {
  await signInAdmin(page);
  await page.context().storageState({ path: join(E2E.authDir, "admin.json") });
});
