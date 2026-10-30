import { expect, test, type Page } from "@playwright/test";

import { E2E } from "./fixtures";
import { completeEmailCode, signInAdmin, signInStaff } from "./helpers";
import { storageFor } from "./pages";

// These change shared state (passkey, lockdown), so they run one after another.
test.describe.configure({ mode: "serial" });

const WRONG = "That email and passkey don't match a permitted account.";

/** The form's own alert (Next.js also renders an empty route announcer with role=alert). */
const formAlert = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

test("security headers are sent", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("script-src 'self' 'nonce-");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("protected pages send signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/certificates");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("wrong passkey, unknown email and disabled staff get the same answer", async ({ page }) => {
  await signInStaff(page, E2E.staff.email, "not-the-passkey");
  await expect(formAlert(page)).toHaveText(WRONG);
  await expect(page.getByLabel("Email")).toHaveValue(E2E.staff.email);

  await signInStaff(page, "stranger@example.com");
  await expect(formAlert(page)).toHaveText(WRONG);

  await signInStaff(page, E2E.disabled.email);
  await expect(formAlert(page)).toHaveText(WRONG);
});

test("form shows field errors without a round trip to the database", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Enter the passkey.")).toBeVisible();
});

test("a trusted device signs in without an email code", async ({ browser }) => {
  const context = await browser.newContext({ storageState: storageFor("staff") });
  const page = await context.newPage();
  await page.goto("/certificates");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await signInStaff(page);
  await expect(page).toHaveURL(/\/certificates$/);
  await context.close();
});

test("a wrong email code is refused", async ({ page }) => {
  await signInStaff(page);
  await expect(page).toHaveURL(/\/verify$/);
  await page.getByLabel("Sign-in code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(formAlert(page)).toContainText("That code isn't right");
  await completeEmailCode(page);
});

test("staff cannot open admin pages", async ({ browser }) => {
  const context = await browser.newContext({ storageState: storageFor("staff") });
  const page = await context.newPage();
  await signInStaff(page); // trusted device, so no email code
  await expect(page).toHaveURL(/\/certificates$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/certificates$/);
  await context.close();
});

test("admin needs the authenticator code", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Admin email").fill(E2E.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E.admin.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(formAlert(page)).toContainText("That code isn't right");
});

test("setup page is closed once an admin exists", async ({ page }) => {
  await page.goto("/admin/setup");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("admin adds, then disables a staff member", async ({ page, browser }) => {
  const email = "new.person@example.com";
  await signInAdmin(page);
  await page.goto("/admin/users");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name (optional)").fill("New Person");
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByRole("status")).toContainText(`${email} can now sign in`);

  const staff = await browser.newContext();
  const staffPage = await staff.newPage();
  await signInStaff(staffPage, email);
  await completeEmailCode(staffPage, email);

  await page.reload();
  const card = page.getByRole("listitem").filter({ hasText: email });
  await card.getByRole("button", { name: "Disable" }).click();
  await expect(card.getByText("Disabled")).toBeVisible();

  await staffPage.goto("/certificates");
  await expect(staffPage).toHaveURL(/\/$/);
  await staff.close();
});

test("lockdown stops staff sign-in until it is turned off", async ({ page, browser }) => {
  await signInAdmin(page);
  await page.goto("/admin/settings");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Turn lockdown on" }).click();
  await expect(page.getByText("Lockdown on")).toBeVisible();

  const staff = await browser.newContext({ storageState: storageFor("staff") });
  const staffPage = await staff.newPage();
  await staffPage.goto("/certificates");
  await expect(staffPage).toHaveURL(/\/$/);
  await signInStaff(staffPage);
  await expect(formAlert(staffPage)).toHaveText("Sign-in is paused by the admin right now.");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Turn lockdown off" }).click();
  await expect(page.getByRole("button", { name: "Turn lockdown on" })).toBeVisible();

  await signInStaff(staffPage);
  await expect(staffPage).toHaveURL(/\/certificates$/);
  await staff.close();
});

test("changing the passkey signs staff out and the new one works", async ({ page, browser }) => {
  const staff = await browser.newContext({ storageState: storageFor("staff") });
  const staffPage = await staff.newPage();
  await signInStaff(staffPage);
  await expect(staffPage).toHaveURL(/\/certificates$/);

  await signInAdmin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("New passkey", { exact: true }).fill("Brand-New-Passkey-1");
  await page.getByLabel("Confirm new passkey").fill("Brand-New-Passkey-1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Change passkey" }).click();
  await expect(page.getByRole("status")).toContainText("Passkey changed");

  await staffPage.goto("/certificates");
  await expect(staffPage).toHaveURL(/\/$/);
  await signInStaff(staffPage);
  await expect(formAlert(staffPage)).toHaveText(WRONG);
  await signInStaff(staffPage, E2E.staff.email, "Brand-New-Passkey-1");
  await expect(staffPage).toHaveURL(/\/certificates$/);
  await staff.close();
});
