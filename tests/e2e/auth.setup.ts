import { join } from "node:path";

import { test as setup } from "@playwright/test";

import { E2E } from "./fixtures";
import { completeEmailCode, signInAdmin, signInStaff } from "./helpers";

setup("sign in as staff", async ({ page }) => {
  await signInStaff(page);
  await completeEmailCode(page);
  await page.context().storageState({ path: join(E2E.authDir, "staff.json") });
});

setup("sign in as an uploader in upload mode", async ({ page }) => {
  await signInStaff(page, E2E.uploader.email);
  await completeEmailCode(page, E2E.uploader.email);
  await page.goto("/upload");
  await page.getByLabel("Upload passkey").fill(E2E.uploader.uploadPasskey);
  await page.getByRole("button", { name: "Unlock upload mode" }).click();
  await page.getByText(/Upload mode is on until/).waitFor();
  await page.context().storageState({ path: join(E2E.authDir, "uploader.json") });
});

setup("sign in as admin", async ({ page }) => {
  await signInAdmin(page);
  await page.context().storageState({ path: join(E2E.authDir, "admin.json") });
});
