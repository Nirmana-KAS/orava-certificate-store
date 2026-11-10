import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { completeEmailCode, signInStaff } from "./helpers";

// Staff permissions: downloads and reports switched per person, and uploaders who unlock upload
// mode with their own passkey. Runs as the admin; each staff member signs in in their own browser.
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} is wider than the screen`).toBeLessThanOrEqual(0);
}

async function noViolations(page: Page, where: string) {
  // From the top, so the sticky header doesn't count as covering a button scrolled under it
  await page.evaluate(() => window.scrollTo(0, 0));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) =>
        `${v.id}: ${v.help} ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary ?? ""}`).join(" | ")}`,
    ),
    where,
  ).toEqual([]);
}

const IPS: Record<string, string> = {
  "admin-flows-phone-320": "10.31.0.1",
  "admin-flows-tablet-768": "10.31.0.2",
  "admin-flows-laptop-1280": "10.31.0.3",
};

/** A staff member's own browser, signed in. A separate network keeps rate limits apart. */
async function staffBrowser(browser: Browser, email: string, project: string, ip: string) {
  const viewport = test.info().project.use.viewport ?? { width: 1280, height: 800 };
  const context = await browser.newContext({
    // New contexts take the project's options, so drop the admin's sign-in explicitly
    storageState: { cookies: [], origins: [] },
    viewport,
    extraHTTPHeaders: { "x-forwarded-for": `${ip}` },
  });
  const page = await context.newPage();
  await signInStaff(page, email);
  await completeEmailCode(page, email);
  void project;
  return { context, page };
}

async function addStaff(page: Page, email: string) {
  await page.goto("/admin/users");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByText(`${email} can now sign in`)).toBeVisible();
}

const row = (page: Page, email: string) => page.locator("main li", { hasText: email });

async function makeUploader(page: Page, email: string): Promise<string> {
  await page.goto("/admin/users");
  page.once("dialog", (d) => d.accept());
  await row(page, email)
    .getByRole("button", { name: /Make uploader|New upload passkey/ })
    .click();
  const shown = row(page, email).getByTestId("issued-upload-passkey");
  await expect(shown).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  return (await shown.textContent())!;
}

test("an uploader unlocks upload mode, adds a certificate, and locks it again", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const email = `uploader-${project}@example.com`;
  await addStaff(page, email);

  // Reports are switched on per person
  await row(page, email).getByRole("button", { name: "Allow reports" }).click();
  await expect(row(page, email).getByText("Can make reports")).toBeVisible();

  const passkey = await makeUploader(page, email);
  await expect(row(page, email).getByText("Uploader", { exact: true })).toBeVisible();
  await noSideScroll(page, "staff page with a new upload passkey");
  await noViolations(page, "staff page with a new upload passkey");

  const staff = await staffBrowser(browser, email, project, IPS[project] ?? "10.31.0.9");
  const s = staff.page;
  try {
    await expect(
      s.getByRole("listitem").filter({ hasText: /^Allowed: Make reports/ }),
    ).toBeVisible();
    await expect(s.getByText("Add and change certificates")).toBeVisible();
    await noSideScroll(s, "staff home");

    // Staff can't open admin pages, and upload pages need upload mode first
    await s.goto("/admin/certificates");
    await expect(s).toHaveURL(/\/certificates$/);
    await s.goto("/upload/import");
    await expect(s).toHaveURL(/\/upload$/);
    await expect(s.getByRole("heading", { name: "Unlock upload mode" })).toBeVisible();
    await noSideScroll(s, "unlock upload mode");
    await noViolations(s, "unlock upload mode");

    // A wrong passkey says how many tries are left
    await s.getByLabel("Upload passkey").fill("AAAA-BBBB-CCCC-DDDD");
    await s.getByRole("button", { name: "Unlock upload mode" }).click();
    await expect(s.getByText(/4 tries left/)).toBeVisible();

    // The right one, typed in lower case without dashes, unlocks it
    await s.getByLabel("Upload passkey").fill(passkey.replaceAll("-", "").toLowerCase());
    await s.getByRole("button", { name: "Unlock upload mode" }).click();
    await expect(s.getByText(/Upload mode is on until/)).toBeVisible();
    await noSideScroll(s, "upload mode home");
    await noViolations(s, "upload mode home");

    // Add a certificate by hand
    const ref = `U-${project}`;
    await s.getByRole("link", { name: "Add by hand" }).first().click();
    await s.getByRole("link", { name: /Bellerophon Lot Wise Gem Stones Report/ }).click();
    await s.getByLabel("Reference No *").fill(ref);
    await s.getByLabel("Date", { exact: true }).fill("2026-07-01");
    await s.getByRole("button", { name: "Add certificate" }).click();
    await expect(s.getByText("Saved.")).toBeVisible();
    await expect(s).toHaveURL(/\/upload\/certificates\/[0-9a-f-]{36}/);
    await noSideScroll(s, "uploader certificate page");
    await noViolations(s, "uploader certificate page");
    // The admin-only tools aren't offered here
    await expect(s.getByRole("button", { name: /Restore/ })).toHaveCount(0);

    // Add from files is open too
    await s.goto("/upload/import");
    await expect(s.getByRole("heading", { name: "Add from files" })).toBeVisible();
    await noSideScroll(s, "uploader add from files");

    // The certificate is listed on the upload home, and the admin sees it too
    await s.goto("/upload");
    await expect(s.getByText(ref).first()).toBeVisible();
    await page.goto("/admin/certificates");
    await expect(page.getByText(ref).first()).toBeVisible();
    await page.goto("/admin/users");
    await expect(row(page, email).getByText("In upload mode")).toBeVisible();

    // Delete it again as the uploader
    await s.goto("/upload");
    await s
      .locator("main li", { hasText: ref })
      .getByRole("link", { name: /^Details of/ })
      .click();
    s.once("dialog", (d) => d.accept());
    await s.getByRole("button", { name: "Delete certificate" }).click();
    await expect(s).toHaveURL(/\/upload$/);
    await expect(s.getByText(ref)).toHaveCount(0);

    // Locking ends upload mode
    await s.getByRole("button", { name: "Lock upload mode" }).click();
    await expect(s).toHaveURL(/\/certificates$/);
    await s.goto("/upload/certificates/new");
    await expect(s).toHaveURL(/\/upload$/);
    await expect(s.getByRole("heading", { name: "Unlock upload mode" })).toBeVisible();

    // Unlocked again, then the admin stops uploads: the next click is refused
    await s.getByLabel("Upload passkey").fill(passkey);
    await s.getByRole("button", { name: "Unlock upload mode" }).click();
    await expect(s.getByText(/Upload mode is on until/)).toBeVisible();
    await page.goto("/admin/users");
    page.once("dialog", (d) => d.accept());
    await row(page, email).getByRole("button", { name: "Stop uploads" }).click();
    await expect(row(page, email).getByText("Uploader", { exact: true })).toHaveCount(0);
    await s.goto("/upload/import");
    await expect(s).toHaveURL(/\/certificates$/);
    await expect(s.getByText("Add and change certificates")).toHaveCount(0);
  } finally {
    await staff.context.close();
  }
});

test("five wrong upload passkeys lock upload mode until the admin gives a new one", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const email = `locked-${project}@example.com`;
  await addStaff(page, email);
  const passkey = await makeUploader(page, email);

  const ip = (IPS[project] ?? "10.31.0.9").replace("10.31.", "10.32.");
  const staff = await staffBrowser(browser, email, project, ip);
  const s = staff.page;
  try {
    await s.goto("/upload");
    for (let i = 1; i <= 4; i++) {
      await s.getByLabel("Upload passkey").fill(`WRNG-WRNG-WRNG-WRN${i + 1}`);
      await s.getByRole("button", { name: "Unlock upload mode" }).click();
      await expect(s.getByText(new RegExp(`${5 - i} tr(y|ies) left`))).toBeVisible();
    }
    await s.getByLabel("Upload passkey").fill("WRNG-WRNG-WRNG-WRN9");
    await s.getByRole("button", { name: "Unlock upload mode" }).click();
    await expect(s.getByText(/Upload mode is now locked/)).toBeVisible();

    // Even the right passkey is refused now
    await s.getByLabel("Upload passkey").fill(passkey);
    await s.getByRole("button", { name: "Unlock upload mode" }).click();
    await expect(s.getByText(/Ask the admin for a new upload passkey/)).toBeVisible();

    // Their normal sign-in still works: wrong upload passkeys don't count against it
    await s.goto("/certificates");
    await expect(s.getByRole("heading", { name: "Certificates" })).toBeVisible();

    // The admin sees the lock and gives a new passkey, which works
    await page.goto("/admin/users");
    await expect(row(page, email).getByText("Uploads locked")).toBeVisible();
    const fresh = await makeUploader(page, email);
    expect(fresh).not.toBe(passkey);
    await s.goto("/upload");
    await s.getByLabel("Upload passkey").fill(fresh);
    await s.getByRole("button", { name: "Unlock upload mode" }).click();
    await expect(s.getByText(/Upload mode is on until/)).toBeVisible();
  } finally {
    await staff.context.close();
  }
});

test("staff without uploads are sent back from upload pages", async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const ip = (IPS[project] ?? "10.31.0.9").replace("10.31.", "10.33.");
  const staff = await staffBrowser(browser, "staff@example.com", project, ip);
  try {
    for (const path of ["/upload", "/upload/import", "/upload/certificates/new"]) {
      await staff.page.goto(path);
      await expect(staff.page).toHaveURL(/\/certificates$/);
    }
    await expect(
      staff.page.getByRole("listitem").filter({ hasText: "Not allowed: Make reports" }),
    ).toBeVisible();
  } finally {
    await staff.context.close();
  }
});
