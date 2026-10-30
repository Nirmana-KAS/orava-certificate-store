import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";
import { generate } from "otplib";

import { E2E } from "./fixtures";

/** Latest 6-digit code emailed to this address (tests write mail to a file). */
export async function latestCode(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const lines = (await readFile(E2E.mailFile, "utf8").catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean);
    const mail = lines
      .map((l) => JSON.parse(l) as { to: string; text: string })
      .filter((m) => m.to === email)
      .at(-1);
    const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No code emailed to ${email}`);
}

export async function signInStaff(
  page: Page,
  email: string = E2E.staff.email,
  passkey: string = E2E.passkey,
) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Passkey", { exact: true }).fill(passkey);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function completeEmailCode(page: Page, email: string = E2E.staff.email) {
  await expect(page).toHaveURL(/\/verify$/);
  await page.getByLabel("Sign-in code").fill(await latestCode(email));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/certificates$/);
}

export async function signInAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Admin email").fill(E2E.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E.admin.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/admin\/login\/verify$/);
  await page.getByLabel("6-digit code").fill(await generate({ secret: E2E.admin.totpSecret }));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
