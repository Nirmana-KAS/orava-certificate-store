import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Certificate types and certificates, as the admin. Each project (screen size) works on its own
// type name so the three runs don't collide.
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

test("the four sample types are listed", async ({ page }) => {
  await page.goto("/admin/types");
  for (const name of [
    "AIGS Gemstone Identification Report",
    "AIGS Analysis Short Report",
    "Bellerophon Gemmological Report",
    "Bellerophon Gemmological Testing Results",
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});

test("a new type can be made with the wizard", async ({ page }, testInfo) => {
  const name = `E2E type ${testInfo.project.name}`;
  await page.goto("/admin/types/new");

  // Step 1
  await page.getByLabel("Type name").fill(name);
  await page.getByLabel("Issuer / laboratory").fill("Test Lab");
  await noSideScroll(page, "wizard step 1");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2
  await page.getByLabel("Field 1 name").fill("Certificate number");
  await page.getByLabel("Counts as (for search and sorting)").selectOption("report_no");
  await page.getByRole("checkbox", { name: "Required" }).check();
  await page.getByRole("button", { name: "Add a field" }).click();
  await page.getByLabel("Field 2 name").fill("Choices");
  await page.getByLabel("Kind").nth(1).selectOption("select");
  await page.getByLabel("Choices (one per line)").fill("Red\nBlue");
  await page.getByRole("button", { name: "Add a field" }).click();
  await page.getByLabel("Field 3 name").fill("Rows");
  await page.getByLabel("Kind").nth(2).selectOption("table");
  await page.getByLabel("Column 1 name").fill("Item");
  await noSideScroll(page, "wizard step 2");
  await noViolations(page, "wizard step 2");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 and 4
  await page.getByLabel("Phrases that identify this type (one per line)").fill("E2E CERTIFICATE");
  await noSideScroll(page, "wizard step 3");
  await page.getByRole("button", { name: "Next" }).click();
  await noSideScroll(page, "wizard step 4");
  await page.getByRole("button", { name: "Create type" }).click();

  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.goto("/admin/types");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});

test("the wizard asks for what is missing", async ({ page }) => {
  await page.goto("/admin/types/new");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Give the type a name." })).toBeVisible();
});

test("a certificate with a table can be added, checked, edited and deleted", async ({
  page,
}, testInfo) => {
  const ref = `C-${testInfo.project.name}`;
  await page.goto("/admin/certificates/new");
  await page.getByRole("link", { name: /Bellerophon Gemmological Testing Results/ }).click();
  await expect(page.getByRole("heading", { name: /Add Bellerophon/ })).toBeVisible();

  // Required field missing: the error shows and what was typed stays
  await page.getByLabel("Total gemstones").fill("2");
  await page.getByRole("button", { name: "Add certificate" }).click();
  await expect(page.getByText("Reference No is required.")).toBeVisible();
  await expect(page.getByLabel("Total gemstones")).toHaveValue("2");

  await page.getByLabel("Reference No *").fill(ref);
  await page.getByLabel("Date", { exact: true }).fill("2026-06-30");
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByLabel("Item No").first().fill("1");
  await page.getByLabel("Carat").first().fill("1.25");
  await page.getByLabel("Identification").first().fill("Natural Ruby");
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByLabel("Item No").nth(1).fill("2");
  await page.getByLabel("Carat").nth(1).fill("abc");
  await noSideScroll(page, "certificate form with table rows");
  await page.getByRole("button", { name: "Add certificate" }).click();
  await expect(page.getByText(/Check the "Carat" column/)).toBeVisible();

  await page.getByLabel("Carat").nth(1).fill("0.5");
  await page.getByRole("button", { name: "Add certificate" }).click();

  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(
    page.getByText(`2 gemstones tested. Reference ${ref} dated 2026-06-30.`),
  ).toBeVisible();
  await noSideScroll(page, "certificate page");
  await noViolations(page, "certificate page");

  // Edit: the saved rows come back
  await expect(page.getByLabel("Identification").first()).toHaveValue("Natural Ruby");
  await page.getByLabel("Total gemstones").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("3 gemstones tested.")).toBeVisible();

  // It appears in the list, then is deleted
  await page.goto("/admin/certificates");
  await expect(page.getByText(ref).first()).toBeVisible();
  await noSideScroll(page, "certificate list");
  await page.locator("li", { hasText: ref }).getByRole("link", { name: "Open" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete certificate" }).click();
  await expect(page).toHaveURL(/\/admin\/certificates$/);
  await expect(page.getByText(ref)).toHaveCount(0);
});

test("an existing type opens for editing", async ({ page }) => {
  await page.goto("/admin/types");
  await page.getByRole("link", { name: "Edit" }).first().click();
  await page.getByRole("button", { name: /^2 Fields$/ }).click();
  await expect(page.getByLabel("Field 1 name")).not.toHaveValue("");
  await noSideScroll(page, "edit type, fields step");
  await noViolations(page, "edit type, fields step");
});
