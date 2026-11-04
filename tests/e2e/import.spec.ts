import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  aigsShortReport,
  bellerophonReport,
  notACertificate,
  scan,
} from "../helpers/certificate-images";

// "Add from files": certificates are read in the browser (OCR), their type is found, the fields
// are filled and the clear ones are saved automatically with their file.
test.describe.configure({ mode: "serial" });

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} is wider than the screen`).toBeLessThanOrEqual(0);
}

async function noViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`,
    ),
    where,
  ).toEqual([]);
}

const card = (page: Page, name: string) => page.getByRole("article", { name });

test("the page explains itself and fits the screen", async ({ page }) => {
  await page.goto("/admin/certificates");
  await page.getByRole("link", { name: "Add from files" }).click();
  await expect(page.getByRole("heading", { name: "Add from files" })).toBeVisible();
  await expect(page.getByText("Choose PDFs or scans")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Save automatically/ })).toBeChecked();
  await noSideScroll(page, "import page");
  await noViolations(page, "import page");
});

test("scans are read, recognised, filled and saved automatically", async ({
  page,
  browser,
}, testInfo) => {
  // Reading takes several seconds per page; one screen size is enough for the reading itself
  test.skip(testInfo.project.name !== "admin-flows-laptop-1280", "reading runs on laptop only");
  test.setTimeout(240_000);

  const short = await scan(
    browser,
    aigsShortReport({
      reportNo: "QA20260001",
      customer: "Example Gems Ltd.",
      stone: "Natural Spinel",
    }),
  );
  const sideways = await scan(
    browser,
    bellerophonReport({ reportNo: "Z12345", stone: "Natural Spinel" }),
  );

  await page.goto("/admin/certificates/import");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      { name: "short-report.png", mimeType: "image/png", buffer: short },
      { name: "sideways-report.png", mimeType: "image/png", buffer: sideways },
    ]);

  const a = card(page, "short-report.png");
  await expect(a.getByText("Saved", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(a.getByText(/Natural Spinel · QA20260001/)).toBeVisible();
  await expect(a.getByText(/Saved automatically/)).toBeVisible();

  const b = card(page, "sideways-report.png");
  await expect(b.getByText("Saved", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(b.getByText(/Z12345/)).toBeVisible();
  await noSideScroll(page, "import page with results");

  // The saved certificate has the values, the file and the text that was read
  await a.getByRole("link", { name: "Open" }).click();
  await expect(page.getByLabel("Customer")).toHaveValue("Example Gems Ltd.");
  await expect(page.getByLabel("Date of Submission")).toHaveValue("2026-05-05");
  await expect(page.getByLabel("Date of Issue")).toHaveValue("2026-05-09");
  await expect(page.getByLabel("Total weight (cts)")).toHaveValue("12.4");
  await expect(page.getByRole("link", { name: "View", exact: true })).toHaveCount(1);
  await page.getByText("Text read from short-report.png").click();
  await expect(page.getByText(/ANALYSIS SHORT REPORT/).first()).toBeVisible();
  await noViolations(page, "imported certificate");

  // The same report again is caught as a duplicate
  await page.goto("/admin/certificates/import");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([{ name: "again.png", mimeType: "image/png", buffer: short }]);
  const again = card(page, "again.png");
  await expect(again.getByText("Already stored", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await again.getByRole("button", { name: "Skip" }).click();
  await expect(again).toHaveCount(0);
});

test("an unknown page waits for the admin to choose the type", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "admin-flows-laptop-1280", "reading runs on laptop only");
  test.setTimeout(180_000);
  const other = await scan(browser, notACertificate());

  await page.goto("/admin/certificates/import");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([{ name: "list.png", mimeType: "image/png", buffer: other }]);
  const c = card(page, "list.png");
  await expect(c.getByText("Look at this")).toBeVisible({ timeout: 120_000 });
  await expect(c.getByText(/couldn't be recognised/)).toBeVisible();
  await c.getByLabel("Certificate type").selectOption({ label: "AIGS Analysis Short Report" });
  await expect(c.getByLabel(/^Report No/)).toBeVisible();
  await expect(c.getByText("Not found").first()).toBeVisible();

  // Required fields are still checked by the server
  await c.getByRole("button", { name: "Save certificate" }).click();
  await expect(c.getByText("Report No is required.")).toBeVisible();
  await c.getByLabel(/^Report No/).fill("QA20269999");
  await c.getByLabel(/^Identification/).fill("Natural Garnet");
  await c.getByRole("button", { name: "Save certificate" }).click();
  await expect(c.getByText("Saved", { exact: true })).toBeVisible({ timeout: 60_000 });
  await noViolations(page, "import page after review");
});
