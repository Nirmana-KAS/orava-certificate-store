import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { entryBytes, listZip } from "../../src/lib/backup/zip";
import { pdf } from "../helpers/sample-files";
import { appEnv, databaseUrl } from "./fixtures";
import { completeEmailCode, signInStaff } from "./helpers";

// Phase 5: the Trash (restore, delete for good, 30-day clean-up), the activity log and
// backups, as the admin at a phone, a tablet and a laptop size.
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

const tagFor = (project: string) =>
  ({ "admin-flows-phone-320": "A", "admin-flows-tablet-768": "B" })[project] ?? "C";

/** Goes to an admin page the way a person would: sidebar on a laptop, "More" on a phone. */
async function openFromNav(page: Page, label: string) {
  const nav = page.getByRole("navigation", { name: "Admin" });
  const more = nav.getByRole("button", { name: "More" });
  if (await more.isVisible()) {
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await noSideScroll(page, "admin More menu");
  }
  await nav.getByRole("link", { name: label, exact: true }).click();
}

async function addCertificate(page: Page, reportNo: string) {
  await page.goto("/admin/certificates/new");
  await page.getByRole("link", { name: /AIGS Individual Gem Stone Report/ }).click();
  await page.getByLabel("Report No *").fill(reportNo);
  await page.getByLabel("Identification *").fill("Spinel");
  await page.getByLabel("Date", { exact: true }).fill("2026-04-04");
  await page.getByRole("button", { name: "Add certificate" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}

async function deleteOpenCertificate(page: Page) {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete certificate" }).click();
  await expect(page).toHaveURL(/\/admin\/certificates\?deleted=1$/);
  await expect(page.getByText("Moved to the Trash.")).toBeVisible();
}

const trashItem = (page: Page, text: string) =>
  page.getByRole("list", { name: "Deleted certificates" }).getByRole("listitem").filter({
    hasText: text,
  });

test("deleted certificates go to the Trash, come back, and can be deleted for good", async ({
  page,
}, testInfo) => {
  const tag = tagFor(testInfo.project.name);
  const ref = `TRQ${tag}1`;
  await addCertificate(page, ref);
  await deleteOpenCertificate(page);

  await openFromNav(page, "Trash");
  await expect(page).toHaveURL(/\/admin\/trash$/);
  const item = trashItem(page, ref);
  await expect(item).toBeVisible();
  await expect(item.getByText(/Erased in (29|30) days/)).toBeVisible();
  await expect(item.getByText(/by Test Admin/)).toBeVisible();
  await noSideScroll(page, "Trash");
  await noViolations(page, "Trash");

  // "Empty Trash" asks first; saying no keeps everything
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Empty Trash" }).click();
  await expect(item).toBeVisible();

  // Restore: back in the list and searchable again
  await item.getByRole("button", { name: /^Restore/ }).click();
  await expect(page.getByText(/is back in the certificate list/)).toBeVisible();
  await expect(trashItem(page, ref)).toHaveCount(0);
  await page.goto(`/admin/certificates?q=${ref}`);
  await expect(page.getByTestId("results").getByText(ref).first()).toBeVisible();

  // Deleted again, and meanwhile a new certificate takes the same report number: it can't be
  // restored until that clash is gone, but it can be deleted for good
  await page
    .getByTestId("results")
    .getByRole("link", { name: /^Details of/ })
    .first()
    .click();
  await deleteOpenCertificate(page);
  await addCertificate(page, ref);
  await page.goto("/admin/trash");
  const clashing = trashItem(page, ref);
  await expect(clashing.getByText(/Can't restore yet/)).toBeVisible();
  await expect(clashing.getByRole("button", { name: /^Restore/ })).toBeDisabled();
  page.once("dialog", (d) => d.accept());
  await clashing.getByRole("button", { name: /for good$/ }).click();
  await expect(page.getByText("Deleted for good, with its files.")).toBeVisible();
  await expect(trashItem(page, ref)).toHaveCount(0);
  await noSideScroll(page, "Trash after deleting for good");
});

test("certificates in the Trash for more than 30 days are erased", async ({ page }, testInfo) => {
  const tag = tagFor(testInfo.project.name);
  const ref = `TRQ${tag}OLD`;
  await addCertificate(page, ref);
  await deleteOpenCertificate(page);

  // Pretend it was deleted 31 days ago
  const sql = postgres(databaseUrl, { max: 1, ssl: false, prepare: false, onnotice: () => {} });
  try {
    await sql`
      update certificates set deleted_at = now() - interval '31 days' where report_no = ${ref}
    `;
  } finally {
    await sql.end();
  }

  await page.goto("/admin/trash");
  await expect(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
  await expect(page.getByText(ref)).toHaveCount(0);

  await page.goto("/admin/activity?kind=trash");
  await expect(
    page.getByTestId("activity").getByText("Erased certificates older than 30 days").first(),
  ).toBeVisible();
});

test("the activity log is filtered, paged and downloaded as CSV", async ({ page }, testInfo) => {
  const tag = tagFor(testInfo.project.name);
  const ref = `ACT${tag}Q`;
  await addCertificate(page, ref);

  await openFromNav(page, "Activity log");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
  await noSideScroll(page, "activity log");
  await noViolations(page, "activity log");

  // Search, kind and person filters, kept in the address
  await page.getByLabel("Search").fill(ref);
  await page.getByLabel("Kind").selectOption("certificates");
  await page.getByLabel("Person").selectOption("admin@example.com");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/q=ACT.*&who=admin%40example\.com&kind=certificates/);
  const list = page.getByTestId("activity");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByText("Added a certificate")).toBeVisible();
  await expect(page.getByText("Showing 1–1 of 1 entry.")).toBeVisible();

  // Details as short label and value points: no raw browser text or action codes
  const entry = list.getByRole("listitem");
  await expect(entry.getByRole("term")).toContainText(["Person", "Browser", "System", "Device"]);
  await expect(entry.getByRole("definition").nth(1)).toHaveText(/^(Headless )?Chrome \d+$/);
  await expect(entry.getByText(/Mozilla\/5\.0/)).toHaveCount(0);
  await expect(entry.getByText(/certificate\.create/)).toHaveCount(0);

  // A kind with nothing for this search
  await page.goto(`/admin/activity?q=${ref}&kind=backup`);
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();

  // CSV with the same filters; the download itself is logged
  await page.goto(`/admin/activity?q=${ref}`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Activity_log_\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await download.path(), "utf8");
  expect(csv.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe(
    "Time (Sri Lanka),Person,What,About,Browser,System,Device,Location,Map,IP address,Details",
  );
  expect(csv).toContain("Added a certificate");
  expect(csv).toContain(ref);
  await page.goto("/admin/activity?kind=backup");
  await expect(
    page.getByTestId("activity").getByText("Downloaded the activity log").first(),
  ).toBeVisible();

  // The staff page links each person to their activity
  await page.goto("/admin/users");
  await page.getByRole("link", { name: "All activity of staff@example.com" }).click();
  await expect(page).toHaveURL(/\/admin\/activity\?who=staff%40example\.com$/);
  await expect(page.getByLabel("Person")).toHaveValue("staff@example.com");
});

function readZip(bytes: Uint8Array) {
  const entries = listZip(bytes);
  const text = (name: string) => {
    const e = entries.find((x) => x.name === name);
    if (!e) throw new Error(`${name} is missing from the backup`);
    const raw = entryBytes(bytes, e);
    return Buffer.from(e.method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
  };
  return { names: entries.map((e) => e.name), text, entries };
}

test("a backup downloads the database and the files as one zip", async ({ page }, testInfo) => {
  const tag = tagFor(testInfo.project.name);
  const ref = `BKQ${tag}1`;
  await addCertificate(page, ref);
  await page.locator("input[type=file]").setInputFiles({
    name: `backup-${tag}.pdf`,
    mimeType: "application/pdf",
    buffer: pdf(`backup-${tag}`),
  });
  await expect(page.getByText("Checked and saved.")).toBeVisible();

  await openFromNav(page, "Backup");
  await expect(page).toHaveURL(/\/admin\/backup$/);
  await noSideScroll(page, "Backup");
  await noViolations(page, "Backup");

  // Database only
  await page.getByLabel(/^Database only/).check();
  const [small] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download backup" }).click(),
  ]);
  expect(small.suggestedFilename()).toMatch(/^orava-backup_.+_database\.zip$/);
  await expect(page.getByTestId("backup-result")).toContainText("Backup saved");
  const db = readZip(new Uint8Array(await readFile(await small.path())));
  expect(db.names).toContain("database/certificates.json");
  expect(db.names).toContain("manifest.json");
  expect(db.names).toContain("README.txt");
  expect(db.names.some((n) => n.startsWith("files/"))).toBe(false);
  const certs = JSON.parse(db.text("database/certificates.json")) as { report_no: string }[];
  expect(certs.some((c) => c.report_no === ref)).toBe(true);
  // Secrets never go into a backup
  const users = db.text("database/app_users.json");
  expect(users).toContain("admin@example.com");
  expect(users).not.toContain("upload_passkey_hash");
  expect(db.text("database/app_settings.json")).not.toContain("passkey_hash");
  expect(db.names.join(" ")).not.toMatch(/admin_credentials|sessions/);
  const labs = JSON.parse(db.text("database/labs.json")) as { logo: { base64: string } | null }[];
  expect(labs.some((l) => l.logo && l.logo.base64.length > 0)).toBe(true);

  // An Excel workbook with clear tables: certificates, one sheet per type, files, staff, activity
  const bookName = db.names.find((n) => /^orava-backup_.+\.xlsx$/.test(n));
  expect(bookName, db.names.join("\n")).toBeTruthy();
  const bookEntry = db.entries.find((e) => e.name === bookName)!;
  const book = readZip(
    new Uint8Array(entryBytes(new Uint8Array(await readFile(await small.path())), bookEntry)),
  );
  const workbook = book.text("xl/workbook.xml");
  for (const sheet of ["About this backup", "Certificates", "Files", "Staff", "Activity log"]) {
    expect(workbook).toContain(`name="${sheet}"`);
  }
  expect(workbook).toContain('name="AIGS Individual Gem Stone"');
  const certSheet = book.text("xl/worksheets/sheet2.xml");
  expect(certSheet).toContain(">Report number<");
  expect(certSheet).toContain(`>${ref}<`);
  expect(certSheet).toContain(">Spinel<");
  expect(certSheet).toContain(">4 Apr 2026<");

  // Everything: the file is in the zip, byte for byte, under its stored name
  await page.getByLabel(/^Everything/).check();
  const [full] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download backup" }).click(),
  ]);
  expect(full.suggestedFilename()).toMatch(/^orava-backup_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/);
  await expect(page.getByTestId("backup-result")).toContainText("Backup saved");
  const all = readZip(new Uint8Array(await readFile(await full.path())));
  const mine = all.names.find(
    (n) => n.startsWith("files/") && n.endsWith(`${ref}_2026-04-04_AIGS.pdf`),
  );
  expect(mine, all.names.join("\n")).toBeTruthy();
  expect(all.text(mine!)).toBe(pdf(`backup-${tag}`).toString("latin1"));
  const manifest = JSON.parse(all.text("manifest.json")) as {
    version: string;
    files: { saved: number };
  };
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(manifest.files.saved).toBeGreaterThan(0);

  // The page shows when the last backup was made, and the log has both
  await page.reload();
  await expect(page.getByTestId("last-backup")).toContainText("admin@example.com");
  await page.goto("/admin/activity?kind=backup&who=admin%40example.com");
  await expect(
    page.getByTestId("activity").getByText("Finished a backup download").first(),
  ).toBeVisible();
  await noSideScroll(page, "Backup after a download");
});

test("backup reminders follow the admin's choice", async ({ page }, testInfo) => {
  // The setting is shared, so one screen size changes it
  test.skip(testInfo.project.name !== "admin-flows-laptop-1280", "shared setting");
  const days = page.getByLabel("Remind me when no backup was made");
  const save = page.getByRole("button", { name: "Save reminder" });
  try {
    await page.goto("/admin/backup");
    await expect(page.getByTestId("remind-now")).toHaveText("Every week");
    await days.selectOption({ label: "Never" });
    await save.click();
    await expect(page.getByText("Backup reminders are off.")).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByText(/No backup (has been made yet|in the last)/)).toHaveCount(0);

    await page.goto("/admin/backup");
    await expect(page.getByTestId("remind-now")).toHaveText("Never");
    await days.selectOption({ label: "Every day" });
    await page.getByLabel("Send an email to the alert address").uncheck();
    await save.click();
    await expect(page.getByText(/You get a banner on the Overview when no backup/)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("remind-now")).toHaveText("Every day");
    await expect(page.getByText(/Every day, by banner\./)).toBeVisible();
    await expect(page.getByLabel("Send an email to the alert address")).not.toBeChecked();
    await noSideScroll(page, "Backup reminder");
    await noViolations(page, "Backup reminder");
  } finally {
    await page.goto("/admin/backup");
    await days.selectOption({ label: "Every week" });
    await page.getByLabel("Show a banner on the Overview page").check();
    await page.getByLabel("Send an email to the alert address").check();
    await save.click();
    await expect(page.getByText(/^Saved\./)).toBeVisible();
  }
});

test("the Overview mentions the Trash only until it is opened", async ({ page }, testInfo) => {
  const tag = tagFor(testInfo.project.name);
  await addCertificate(page, `TRB${tag}1`);
  await deleteOpenCertificate(page);

  // Other screen sizes delete certificates at the same time, so try until a quiet moment
  const banner = page.getByText(/deleted since you last looked at the\s+Trash/);
  await expect(async () => {
    await page.goto("/admin/trash");
    await expect(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(banner).toHaveCount(0, { timeout: 500 });
  }).toPass({ timeout: 60_000 });
});

test("staff sign-ins show the place on a map", async ({ page, browser }, testInfo) => {
  const tag = tagFor(testInfo.project.name);
  const email = `place-${tag.toLowerCase()}@example.com`;
  await page.goto("/admin/users");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByText(`${email} can now sign in`)).toBeVisible();

  // Vercel adds these place headers in front of the app
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: {
      "x-forwarded-for": `10.52.0.${tag.charCodeAt(0)}`,
      "x-vercel-ip-city": "Colombo",
      "x-vercel-ip-country": "LK",
      "x-vercel-ip-latitude": "6.9271",
      "x-vercel-ip-longitude": "79.8612",
    },
  });
  try {
    const s = await context.newPage();
    await signInStaff(s, email);
    await completeEmailCode(s, email);
  } finally {
    await context.close();
  }

  await page.goto("/admin/users");
  const card = page.locator("main li", { hasText: email });
  const place = card.getByRole("link", { name: /Colombo, Sri Lanka/ });
  await expect(place).toBeVisible();
  await expect(place).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=6.9271%2C79.8612",
  );
  await expect(place).toHaveAttribute("target", "_blank");
  await expect(card.getByText(/Chrome \d+ on /)).toBeVisible();
  await noSideScroll(page, "Staff with sign-in places");
  await noViolations(page, "Staff with sign-in places");

  await page.goto(`/admin/activity?who=${encodeURIComponent(email)}&kind=sign_in`);
  await expect(
    page
      .getByTestId("activity")
      .getByRole("link", { name: /Colombo, Sri Lanka/ })
      .first(),
  ).toBeVisible();
});

test("staff can't open the backup or activity data", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "test-results/.auth/staff.json" });
  const page = await context.newPage();
  for (const url of [
    "/api/backup?part=table&name=app_users",
    "/api/backup?part=files",
    "/api/activity",
  ]) {
    const res = await page.request.get(url);
    expect(res.status(), url).toBe(404);
  }
  expect((await page.request.get("/api/cron/daily")).status()).toBe(401);
  expect(
    (
      await page.request.get("/api/cron/daily", {
        headers: { authorization: "Bearer wrong-secret-0123456789" },
      })
    ).status(),
  ).toBe(401);
  await context.close();
});

test("the daily job runs with the cron secret", async ({ request }) => {
  const tries: Record<string, string>[] = [
    { authorization: `Bearer ${appEnv.CRON_SECRET}` },
    { "x-cron-secret": appEnv.CRON_SECRET },
  ];
  for (const headers of tries) {
    const res = await request.get("/api/cron/daily", { headers });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean; erased: { certificates: number } };
    expect(body.ok).toBe(true);
    expect(body.erased.certificates).toBeGreaterThanOrEqual(0);
  }
});

test("staff are sent away from the Trash", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "test-results/.auth/staff.json" });
  const page = await context.newPage();
  await page.goto("/admin/trash");
  await expect(page).not.toHaveURL(/\/admin\/trash$/);
  await context.close();
});
