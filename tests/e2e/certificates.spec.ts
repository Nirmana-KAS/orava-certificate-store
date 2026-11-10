import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { pdf, pdfWithHiddenScript, png } from "../helpers/sample-files";
import { E2E } from "./fixtures";

const appStorage = `http://127.0.0.1:${E2E.storagePort}`;

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

test("the four sample types are listed with their labs and logos", async ({ page }) => {
  await page.goto("/admin/types");
  for (const name of [
    "AIGS Individual Gem Stone Report",
    "AIGS Lot Wise Gem Stones Report",
    "Bellerophon Individual Gem Stone Report",
    "Bellerophon Lot Wise Gem Stones Report",
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: "AIGS logo" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Bellerophon logo" }).first()).toBeVisible();
  // Logos load (they are real images, sent so a browser never runs them)
  const src = await page.getByRole("img", { name: "AIGS logo" }).first().getAttribute("src");
  const logo = await page.request.get(src!);
  expect(logo.headers()["content-type"]).toBe("image/webp");
  expect(logo.headers()["x-content-type-options"]).toBe("nosniff");
});

test("labs can be added with a logo, and edited", async ({ page }, testInfo) => {
  const short = `Lab${testInfo.project.name.replace(/[^a-z0-9]/gi, "").slice(-12)}`;
  await page.goto("/admin/types");
  await page.getByRole("link", { name: "Labs and logos" }).click();
  await expect(page.getByRole("heading", { name: "Labs" })).toBeVisible();
  await expect(page.getByText("Asian Institute of Gemological Sciences")).toBeVisible();
  await page.getByRole("link", { name: "Add lab" }).click();

  await page.getByLabel("Full name").fill(`Test Gem Laboratory ${short}`);
  await page.getByLabel("Short name").fill(short);
  await page.getByLabel("Website (optional)").fill("http://not-https.example");
  await page.locator("input[type=file]").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: png(short),
  });
  await expect(page.getByRole("img", { name: `${short} logo` })).toBeVisible();
  await noSideScroll(page, "new lab");
  await noViolations(page, "new lab");
  await page.getByRole("button", { name: "Add lab" }).click();
  await expect(page.getByText("Start the website with https://")).toBeVisible();
  await page.getByLabel("Website (optional)").fill("");
  await page.getByRole("button", { name: "Add lab" }).click();

  await expect(page.getByText("Saved.")).toBeVisible();
  const row = page.locator("li", { hasText: `Test Gem Laboratory ${short}` });
  await expect(row.getByRole("img", { name: `${short} logo` })).toBeVisible();
  await noSideScroll(page, "labs");

  // The same short name can't be used twice
  await page.goto("/admin/labs/new");
  await page.getByLabel("Full name").fill("Another lab");
  await page.getByLabel("Short name").fill(short);
  await page.getByRole("button", { name: "Add lab" }).click();
  await expect(page.getByText("Another lab already has this short name.")).toBeVisible();
});

test("a new type can be made with the wizard", async ({ page }, testInfo) => {
  const name = `E2E type ${testInfo.project.name}`;
  await page.goto("/admin/types/new");

  // Step 1: choosing the lab and kind fills in the name, which can still be changed
  await page.getByLabel("Lab", { exact: true }).selectOption({
    label: "AIGS (Asian Institute of Gemological Sciences)",
  });
  await page.getByLabel("Kind of report").selectOption({ label: "Lot Wise Gem Stones Report" });
  await expect(page.getByLabel("Type name")).toHaveValue("AIGS Lot Wise Gem Stones Report");
  await expect(page.getByRole("img", { name: "AIGS logo" })).toBeVisible();
  await page.getByLabel("Type name").fill(name);
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
  await page.getByRole("link", { name: /Bellerophon Lot Wise Gem Stones Report/ }).click();
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

  // The same reference number can't be stored twice
  await page.goto("/admin/certificates/new");
  await page.getByRole("link", { name: /Bellerophon Lot Wise Gem Stones Report/ }).click();
  await page.getByLabel("Reference No *").fill(ref.toLowerCase());
  await page.getByRole("button", { name: "Add certificate" }).click();
  await expect(
    page.getByText(new RegExp(`Report number ${ref.toLowerCase()} is already stored`)),
  ).toBeVisible();
  await expect(page.getByLabel("Reference No *")).toHaveValue(ref.toLowerCase());

  // It appears in the list, then is deleted
  await page.goto("/admin/certificates");
  await expect(page.getByText(ref).first()).toBeVisible();
  await noSideScroll(page, "certificate list");
  await page
    .locator("li", { hasText: ref })
    .getByRole("link", { name: /^Details of/ })
    .click();
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

test("scans are checked, stored privately, viewed, downloaded and removed", async ({
  page,
  browser,
}, testInfo) => {
  const tag = testInfo.project.name;
  await page.goto("/admin/certificates/new");
  await page.getByRole("link", { name: /AIGS Lot Wise Gem Stones Report/ }).click();
  await page.getByLabel("Report No *").fill(`F-${tag}`);
  await page.getByLabel("Identification *").fill("Natural Sapphire");
  await page.getByLabel("Date of Issue").fill("2026-08-14");
  await page.getByRole("button", { name: "Add certificate" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  const picker = page.locator("input[type=file]");
  const result = (name: string) => page.locator("li", { hasText: name });

  // A real PDF and a real PNG are accepted; the PNG is turned into a PDF first
  const base = `F-${tag}_2026-08-14_AIGS`;
  await picker.setInputFiles([
    { name: `scan-${tag}.pdf`, mimeType: "application/pdf", buffer: pdf(tag) },
    { name: `photo-${tag}.png`, mimeType: "image/png", buffer: png(tag) },
  ]);
  await expect(result(`scan-${tag}.pdf`).getByText("Checked and saved.")).toBeVisible();
  await expect(result(`photo-${tag}.png`).getByText("Checked and saved.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View", exact: true })).toHaveCount(2);
  // Both are stored as PDFs named Report number_Date_Lab
  await page.reload();
  await expect(page.getByText(`${base}.pdf`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${base}_2.pdf`, { exact: true })).toBeVisible();
  await expect(page.getByText(`uploaded as photo-${tag}.png`, { exact: false })).toBeVisible();
  await noSideScroll(page, "certificate with files");

  // A text file pretending to be a PDF, a PDF with a hidden script, and a duplicate are refused
  await picker.setInputFiles([
    {
      name: `fake-${tag}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(`not a pdf ${tag}`),
    },
    { name: `script-${tag}.pdf`, mimeType: "application/pdf", buffer: pdfWithHiddenScript(tag) },
    { name: `again-${tag}.png`, mimeType: "image/png", buffer: png(tag) },
    {
      name: `page-${tag}.html`,
      mimeType: "text/html",
      buffer: Buffer.from("<script>alert(1)</script>"),
    },
  ]);
  await expect(result(`fake-${tag}.pdf`).getByText(/is not a real PDF/)).toBeVisible();
  await expect(result(`script-${tag}.pdf`).getByText(/contains JavaScript/)).toBeVisible();
  await expect(result(`again-${tag}.png`).getByText(/is already attached/)).toBeVisible();
  await expect(result(`page-${tag}.html`).getByText(/Only PDF, JPEG, PNG or WebP/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "View", exact: true })).toHaveCount(2);

  // Refused files were deleted from storage, accepted ones are there
  const stored = (await (
    await page.request.get(`${appStorage}/storage/v1/__test/objects`)
  ).json()) as string[];
  const certId = new URL(page.url()).pathname.split("/").pop()!;
  expect(stored.filter((k) => k.includes(certId)).sort()).toEqual([
    `certificates/${certId}/${base}.pdf`,
    `certificates/${certId}/${base}_2.pdf`,
  ]);
  // The photo arrived as a PDF
  const photo = await page.request.get(
    `${appStorage}/storage/v1/__test/object/certificates/${certId}/${base}_2.pdf`,
  );
  expect((await photo.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // View goes through a short-lived signed link and returns the same bytes
  const href = await page
    .getByRole("link", { name: "View", exact: true })
    .first()
    .getAttribute("href");
  const viewed = await page.request.get(href!, { maxRedirects: 0 });
  expect(viewed.status()).toBe(303);
  expect(viewed.headers()["location"]).toContain("/object/sign/certificates/");
  expect(viewed.headers()["cache-control"]).toContain("no-store");
  const body = await page.request.get(viewed.headers()["location"]!);
  expect(Buffer.from(await body.body()).equals(pdf(tag))).toBe(true);

  const dl = await page.request.get(`${href}?download=1`, { maxRedirects: 0 });
  expect(dl.headers()["location"]).toContain(`download=${encodeURIComponent(`${base}.pdf`)}`);

  // Signed-out visitors (and later, anyone without permission) get nothing
  const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const denied = await stranger.request.get(`${testInfo.project.use.baseURL ?? ""}${href}`, {
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(404);
  await stranger.close();

  // Remove one file
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "View", exact: true })).toHaveCount(1);
  await expect(page.locator("label", { hasText: "Add PDF or scan" })).toBeVisible();
  // The one left takes the plain name (no _2)
  await expect(page.getByText(`${base}.pdf`, { exact: true })).toBeVisible();

  // A new date renames the stored file to match
  await page.getByLabel("Date of Issue").fill("2026-08-15");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText(`F-${tag}_2026-08-15_AIGS.pdf`, { exact: true })).toBeVisible();
  await noViolations(page, "certificate with files");
});

test("the health page shows details only to the admin", async ({ page, browser }, testInfo) => {
  const admin = await (await page.request.get("/api/health")).json();
  expect(admin.database).toMatch(/^ok/);
  expect(admin.fileStorage).toMatch(/^ok/);
  expect(JSON.stringify(admin)).not.toContain(E2E.storageKey);

  const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const res = await stranger.request.get(`${testInfo.project.use.baseURL ?? ""}/api/health`);
  expect(await res.json()).toEqual({ status: "ok" });
  await stranger.close();
});
