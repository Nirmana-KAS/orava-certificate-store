import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { completeEmailCode, signInStaff } from "./helpers";

// Staff find certificates: search, filters, sorting, the certificate page and downloads, which
// only people with the Download permission get. Runs as the admin; staff use their own browser.
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
  "admin-flows-phone-320": "10.41.0.1",
  "admin-flows-tablet-768": "10.41.0.2",
  "admin-flows-laptop-1280": "10.41.0.3",
};

async function staffBrowser(browser: Browser, email: string, ip: string) {
  const context = await browser.newContext({
    // New contexts take the project's options, so drop the admin's sign-in explicitly
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

/** Opens "More filters and sorting" if it is closed. */
async function openFilters(page: Page) {
  const details = page.locator("details", { hasText: "More filters and sorting" });
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await page.getByText("More filters and sorting").click();
  }
}

const results = (page: Page) => page.getByTestId("results").locator(":scope > li");

test("staff search, filter, sort and open certificates; downloads follow the permission", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const tag = project.replace("admin-flows-", "").replace(/\W/g, "").toUpperCase();
  const ruby = `SR${tag}A`;
  const sapphire = `SR${tag}B`;
  await addStone(page, {
    reportNo: ruby,
    stone: `Ruby ${tag}`,
    carat: "2.15",
    origin: `Burma ${tag}`,
    date: "2026-03-01",
  });
  await addStone(page, {
    reportNo: sapphire,
    stone: `Sapphire ${tag}`,
    carat: "5.4",
    origin: `Ceylon ${tag}`,
    date: "2026-04-01",
  });

  // The admin's list has the same search
  await page.goto(`/admin/certificates?q=${ruby}`);
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).first()).toContainText(`Ruby ${tag}`);

  const email = `viewer-${project}@example.com`;
  await page.goto("/admin/users");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByText(`${email} can now sign in`)).toBeVisible();

  const staff = await staffBrowser(browser, email, IPS[project] ?? "10.41.0.9");
  const s = staff.page;
  try {
    await expect(s.getByRole("heading", { name: "Certificates", level: 1 })).toBeVisible();
    await noSideScroll(s, "staff list");
    await noViolations(s, "staff list");

    // Search: every word must match, in any field
    await s.getByLabel("Search", { exact: true }).fill(`${tag} ruby`);
    await s.getByRole("button", { name: "Search", exact: true }).click();
    await expect(s).toHaveURL(/q=/);
    await expect(results(s)).toHaveCount(1);
    await expect(results(s).first()).toContainText(ruby);
    await expect(s.getByText("Showing 1–1 of 1 certificate.")).toBeVisible();

    // Filters: origin and carats, with a chip to remove each
    await s.getByLabel("Search", { exact: true }).fill(tag);
    await openFilters(s);
    await s.getByLabel("Origin").selectOption(`Ceylon ${tag}`);
    await s.getByRole("button", { name: "Apply" }).click();
    await expect(s).toHaveURL(/origin=/);
    await expect(results(s)).toHaveCount(1);
    await expect(results(s).first()).toContainText(sapphire);
    await noSideScroll(s, "staff list with filters open");
    await noViolations(s, "staff list with filters open");
    await s.getByRole("link", { name: `Remove filter Origin: Ceylon ${tag}` }).click();
    await expect(s).not.toHaveURL(/origin=/);
    await expect(results(s)).toHaveCount(2);
    // The boxes show what is in use now
    await openFilters(s);
    await expect(s.getByLabel("Origin")).toHaveValue("");

    await openFilters(s);
    await s.getByLabel("Carats from").fill("3");
    await s.getByRole("button", { name: "Apply" }).click();
    await expect(s).toHaveURL(/min=3/);
    await expect(results(s)).toHaveCount(1);
    await expect(results(s).first()).toContainText(sapphire);
    await s.getByRole("link", { name: "Remove filter At least 3 ct" }).click();
    await expect(s).not.toHaveURL(/min=/);

    // Sorting by carats, highest first, then lowest first
    await openFilters(s);
    await s.getByLabel("Sort by").selectOption("carat_desc");
    await s.getByRole("button", { name: "Apply" }).click();
    await expect(s).toHaveURL(/sort=carat_desc/);
    await expect(results(s).first()).toContainText(sapphire);
    await s.getByLabel("Sort by").selectOption("carat_asc");
    await s.getByRole("button", { name: "Apply" }).click();
    await expect(s).toHaveURL(/sort=carat_asc/);
    await expect(results(s).first()).toContainText(ruby);

    // Nothing found says so
    await s.goto("/certificates?q=no-such-certificate-xyz");
    await expect(s.getByText("No certificates found.")).toBeVisible();

    // The certificate page: details and a download button for people who may download
    await s.goto(`/certificates?q=${ruby}`);
    await results(s)
      .first()
      .getByRole("link", { name: /^Details of/ })
      .click();
    await expect(s).toHaveURL(/\/certificates\/[0-9a-f-]{36}$/);
    const detailUrl = s.url();
    await expect(s.getByText(`Burma ${tag}`, { exact: true })).toBeVisible();
    await expect(s.getByText("2.15 ct", { exact: true })).toBeVisible();
    await expect(s.getByText("No file has been added yet.")).toBeVisible();
    await expect(s.getByRole("link", { name: /Edit this certificate/ })).toHaveCount(0);
    await noSideScroll(s, "staff certificate page");
    await noViolations(s, "staff certificate page");

    // Made view-only: the download button goes, and the file link refuses to download
    await page.goto("/admin/users");
    await page
      .locator("main li", { hasText: email })
      .getByRole("button", { name: "Make view only" })
      .click();
    await expect(
      page.locator("main li", { hasText: email }).getByText("View only", { exact: true }),
    ).toBeVisible();
    await s.goto(detailUrl);
    await expect(s.getByText(/Ask the admin if you need to download it/)).toBeVisible();
    await s.goto("/certificates");
    await expect(
      s.getByRole("listitem").filter({ hasText: "Not allowed: Download files" }),
    ).toBeVisible();
    const refused = await s.request.get(
      "/api/files/00000000-0000-4000-8000-000000000000?download=1",
    );
    expect(refused.status()).toBe(403);

    // Live updates: with the staff page left open, the admin's changes show without a reload
    await page
      .locator("main li", { hasText: email })
      .getByRole("button", { name: "Allow downloads" })
      .click();
    await expect(
      s.getByRole("listitem").filter({ hasText: "Allowed: Download files" }),
    ).toBeVisible({ timeout: 25_000 });

    // And when the admin signs them out, the open page goes to the sign-in page
    await page
      .locator("main li", { hasText: email })
      .getByRole("button", { name: "Sign out" })
      .click();
    await expect(s.getByLabel("Passkey", { exact: true })).toBeVisible({ timeout: 25_000 });
  } finally {
    await staff.context.close();
  }
});
