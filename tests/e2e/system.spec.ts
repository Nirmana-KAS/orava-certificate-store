import { readFile, rm, writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { appEnv, E2E } from "./fixtures";

// Phase 6: the System Map at a phone, a tablet and a laptop size. Only the laptop makes a part
// look broken, because the health checks are shared by every test running at the same time.
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
      (v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    ),
    where,
  ).toEqual([]);
}

async function mails(subject: RegExp): Promise<{ to: string; subject: string; text: string }[]> {
  const lines = (await readFile(E2E.mailFile, "utf8").catch(() => "")).trim().split("\n");
  return lines
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { to: string; subject: string; text: string })
    .filter((m) => subject.test(m.subject));
}

const isLaptop = () => test.info().project.name === "admin-flows-laptop-1280";

test("the System Map shows every part, its checks and its connections", async ({ page }) => {
  await page.goto("/admin/system");
  await expect(page.getByRole("heading", { name: "System map", level: 1 })).toBeVisible();
  // The open page runs the checks when the last ones are old
  await expect(page.getByTestId("last-check")).toBeVisible({ timeout: 45_000 });

  const wide = (page.viewportSize()?.width ?? 0) >= 768;
  if (wide) {
    await expect(page.getByTestId("system-diagram")).toBeVisible();
    await page.getByTestId("map-part-database").click();
  } else {
    await expect(page.getByTestId("list-part-database")).toBeVisible();
    await page.getByTestId("list-part-database").click();
  }
  const details = page.getByTestId("system-details");
  await expect(details.getByTestId("detail-title")).toHaveText("Database");
  await expect(details.getByText("Locked to the app (row security)")).toBeVisible();
  await expect(details.getByText("Every table is locked")).toBeVisible();
  await expect(details.getByRole("button", { name: "Diagnose & Fix" })).toBeVisible();
  await noSideScroll(page, "System map with details");

  // The list works at every size, and shows what flows through a connection
  await page.getByRole("button", { name: "List" }).click();
  await page.getByTestId("list-link-app-storage").click();
  await expect(details).toContainText("Example of what is sent");
  await expect(details).toContainText("expiresIn");
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(details).toBeHidden();

  // Every part has a status on the list
  for (const id of ["app", "gate", "database", "storage", "email", "reader", "config"]) {
    await expect(page.getByTestId(`list-part-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("list-part-geocoder")).toContainText("Turned off");
  await noSideScroll(page, "System map list");
  await noViolations(page, "System map");

  // The admin menu links to it
  await page.goto("/admin");
  const bell = page.getByTestId("system-bell");
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page).toHaveURL(/\/admin\/system$/);
});

test("the scheduled check needs the secret and records a run", async ({ request }) => {
  test.skip(!isLaptop(), "Shared state: run once");
  expect((await request.get("/api/health/check")).status()).toBe(401);
  const res = await request.get("/api/health/check", {
    headers: { "x-cron-secret": appEnv.CRON_SECRET },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { overall: string; ms: number };
  expect(["ok", "warn", "fail"]).toContain(body.overall);
  // Only the overall result, never the details
  expect(Object.keys(body).sort()).toEqual(["ms", "overall"]);
});

test("a broken part opens a problem, alerts the admin, and Diagnose & Fix fixes it", async ({
  page,
}) => {
  test.skip(!isLaptop(), "Shared state: run once");
  const before = (await mails(/File storage is not working/)).length;
  await writeFile(E2E.healthFailFile, "storage:fixable");
  try {
    await page.goto("/admin/system");
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.getByTestId("system-overall")).toContainText("Not working: File storage", {
      timeout: 45_000,
    });
    await expect(page.getByTestId("incidents")).toContainText("File storage");
    await expect(page.getByTestId("map-part-storage")).toContainText("Not working");

    // One alert email
    await expect
      .poll(async () => (await mails(/File storage is not working/)).length)
      .toBe(before + 1);

    // The bell and the banner show it on the other admin pages
    await page.goto("/admin/certificates");
    await expect(page.getByTestId("problem-banner")).toContainText("File storage");
    await expect(page.getByTestId("system-bell")).toHaveAccessibleName(/1 part not working/);

    // Diagnose & Fix tries the safe fixes and checks again
    await page.getByTestId("problem-banner").getByRole("link").click();
    await page.getByTestId("map-part-storage").click();
    await page
      .getByTestId("system-details")
      .getByRole("button", { name: "Diagnose & Fix" })
      .click();
    const result = page.getByTestId("diagnose-result");
    await expect(result).toContainText("Fixed", { timeout: 60_000 });
    await rm(E2E.healthFailFile, { force: true });

    const download = page.waitForEvent("download");
    await result.getByRole("link", { name: "Download the report" }).click();
    const text = await readFile(await (await download).path(), "utf8");
    expect(text).toContain("Diagnose & Fix report");
    expect(text).toContain("Part:      File storage");
    expect(text).toContain("Result:    Fixed");
    expect(text).toContain("Made sure the bucket exists and is private");

    await expect(page.getByTestId("reports")).toContainText("File storage");
    await expect(page.getByTestId("system-overall")).not.toContainText("Not working: File storage");
    await expect
      .poll(async () => (await mails(/File storage works again/)).length)
      .toBeGreaterThan(0);

    // The banner is gone
    await page.goto("/admin/certificates");
    await expect(page.getByTestId("problem-banner")).toHaveCount(0);
  } finally {
    await rm(E2E.healthFailFile, { force: true });
  }
});

test("staff can't open the System Map or its reports", async ({ browser }) => {
  test.skip(!isLaptop(), "Run once");
  const ctx = await browser.newContext({ storageState: `${E2E.authDir}/staff.json` });
  const page = await ctx.newPage();
  const res = await page.goto("/admin/system");
  expect(page.url()).not.toMatch(/\/admin\/system$/);
  expect(res?.status()).toBeLessThan(500);
  const r = await page.request.get("/admin/system/reports/00000000-0000-0000-0000-000000000000");
  expect([302, 303, 307, 403, 404]).toContain(r.status());
  expect(await r.text()).not.toContain("Diagnose");
  await ctx.close();
});
