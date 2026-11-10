import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { completeEmailCode, signInStaff } from "./helpers";

// Reports: pick certificates, columns and grouping, see counts and carats, and download PDF,
// Excel and CSV. Only the admin and staff with "Can make reports" may.
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} is wider than the screen`).toBeLessThanOrEqual(0);
}

async function noViolations(page: Page, where: string) {
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
  "admin-flows-phone-320": "10.51.0.1",
  "admin-flows-tablet-768": "10.51.0.2",
  "admin-flows-laptop-1280": "10.51.0.3",
};

async function staffBrowser(browser: Browser, email: string, ip: string) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: test.info().project.use.viewport ?? { width: 1280, height: 800 },
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await signInStaff(page, email);
  await completeEmailCode(page, email);
  return { context, page };
}

async function addStone(
  page: Page,
  v: { reportNo: string; stone: string; carat: string; origin: string; date: string },
) {
  await page.goto("/admin/certificates/new");
  await page.getByRole("link", { name: /AIGS Individual Gem Stone Report/ }).click();
  await page.getByLabel("Report No *").fill(v.reportNo);
  await page.getByLabel("Identification *").fill(v.stone);
  await page.getByLabel("Weight (ct)").fill(v.carat);
  await page.getByLabel("Origin").fill(v.origin);
  await page.getByLabel("Date", { exact: true }).fill(v.date);
  await page.getByRole("button", { name: "Add certificate" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}

test("a grouped report is shown and downloaded as PDF, Excel and CSV", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  // Different from the search test's words, so neither finds the other's certificates
  const tag = `RPQ${{ "admin-flows-phone-320": "A", "admin-flows-tablet-768": "B" }[project] ?? "C"}`;
  await addStone(page, {
    reportNo: `${tag}1`,
    stone: "Ruby",
    carat: "1.5",
    origin: `Burma ${tag}`,
    date: "2026-05-02",
  });
  await addStone(page, {
    reportNo: `${tag}2`,
    stone: "Ruby",
    carat: "2.25",
    origin: `Burma ${tag}`,
    date: "2026-06-10",
  });
  await addStone(page, {
    reportNo: `${tag}3`,
    stone: "Sapphire",
    carat: "4",
    origin: `Ceylon ${tag}`,
    date: "2026-06-11",
  });

  // Build it from the page: words, title, columns and grouping
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await page.getByLabel("Search words (optional)").fill(tag);
  await page.getByLabel("Report title").fill(`Stones by origin ${tag}`);
  await page.getByLabel("Group by").selectOption("origin");
  await page.getByRole("checkbox", { name: "Customer" }).check();
  await page.getByRole("button", { name: "Show report" }).click();
  await expect(page).toHaveURL(/group=origin/);

  await expect(page.getByRole("heading", { name: `Stones by origin ${tag}` })).toBeVisible();
  await expect(page.getByText("3 certificates, 7.75 ct in total")).toBeVisible();
  const table = page.getByRole("region", { name: "Report table" });
  await expect(table.getByRole("rowheader", { name: new RegExp(`Burma ${tag}`) })).toContainText(
    "2 certificates · 3.75 ct",
  );
  await expect(table.getByRole("rowheader", { name: new RegExp(`Ceylon ${tag}`) })).toContainText(
    "1 certificate · 4 ct",
  );
  await expect(table.getByRole("columnheader", { name: "Customer" })).toBeVisible();
  await noSideScroll(page, "report page");
  await noViolations(page, "report page");

  // Downloads
  const csvLink = page.getByRole("link", { name: "Download CSV" });
  const csv = await page.request.get((await csvLink.getAttribute("href"))!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toMatch(/Stones_by_origin_.*\.csv/);
  const text = await csv.text();
  expect(text).toContain("Origin,Report number,Date,Lab,Stone,Carats,Origin,Customer");
  expect(text).toContain(`Burma ${tag},${tag}1,02 May 2026,AIGS,Ruby,1.5,Burma ${tag}`);

  const xlsx = await page.request.get(
    (await page.getByRole("link", { name: "Download Excel" }).getAttribute("href"))!,
  );
  expect(xlsx.status()).toBe(200);
  const xbytes = await xlsx.body();
  expect(xbytes.subarray(0, 2).toString()).toBe("PK");

  const pdf = await page.request.get(
    (await page.getByRole("link", { name: "Download PDF" }).getAttribute("href"))!,
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Grouped by month instead: newest month first
  await page.getByLabel("Group by").selectOption("month");
  await page.getByRole("button", { name: "Show report" }).click();
  await expect(page).toHaveURL(/group=month/);
  const groups = table.getByRole("rowheader");
  await expect(groups.first()).toContainText("June 2026");
  await expect(groups.nth(1)).toContainText("May 2026");

  // Staff: only with "Can make reports"
  const email = `reporter-${project}@example.com`;
  await page.goto("/admin/users");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByText(`${email} can now sign in`)).toBeVisible();

  const staff = await staffBrowser(browser, email, IPS[project] ?? "10.51.0.9");
  const s = staff.page;
  try {
    await expect(s.getByRole("link", { name: "Make a report" })).toHaveCount(0);
    await s.goto("/reports");
    await expect(s).toHaveURL(/\/certificates$/);
    const refused = await s.request.get(`/api/reports?q=${tag}&format=csv`);
    expect(refused.status()).toBe(403);

    await page
      .locator("main li", { hasText: email })
      .getByRole("button", { name: "Allow reports" })
      .click();
    await expect(
      page.locator("main li", { hasText: email }).getByText("Can make reports", { exact: true }),
    ).toBeVisible();
    // The open staff page picks the change up by itself
    await expect(s.getByRole("link", { name: "Make a report" })).toBeVisible({ timeout: 25_000 });
    await s.getByRole("link", { name: "Make a report" }).click();
    await s.getByLabel("Search words (optional)").fill(tag);
    await s.getByRole("button", { name: "Show report" }).click();
    await expect(s.getByText("3 certificates, 7.75 ct in total")).toBeVisible();
    await noSideScroll(s, "staff report page");
    const allowed = await s.request.get(`/api/reports?q=${tag}&format=csv`);
    expect(allowed.status()).toBe(200);
  } finally {
    await staff.context.close();
  }
});
