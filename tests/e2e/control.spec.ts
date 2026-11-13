import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { E2E } from "./fixtures";
import { completeEmailCode, signInAdmin, signInStaff } from "./helpers";

// Phase 6b: the Control Center. Its switches change the whole app for everyone, so this file
// runs on its own after every other test, one step after another, at phone, tablet and laptop
// sizes.
test.describe.configure({ mode: "serial", timeout: 180_000 });

const CONTROL_PASSKEY = "Control-Passkey-2026";
const NEW_PASSKEY = "Second-Control-Key-2026";

const SIZES = [
  { name: "phone-320", width: 320, height: 568 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 800 },
] as const;

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} is wider than the screen`).toBeLessThanOrEqual(0);
}

async function noViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    ),
    where,
  ).toEqual([]);
}

/** Every button, field and link (outside running text) is at least 44 × 44 px. */
async function bigTargets(page: Page, where: string, within = "main") {
  const small = await page.evaluate(
    ({ within }) => {
      const root = document.querySelector(within) ?? document.body;
      return Array.from(
        root.querySelectorAll<HTMLElement>("button, input:not([type=hidden]), select, textarea, a"),
      )
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          if (el.closest(".react-flow")) return false; // the wide map is for laptops; the list is for touch
          if (el.tagName === "A" && el.closest("p, li")) return false;
          const target =
            el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)
              ? (el.closest("label") ?? el)
              : el;
          const r = target.getBoundingClientRect();
          return r.width > 0 && (r.width < 44 || r.height < 44);
        })
        .map((el) => el.outerHTML.slice(0, 100));
    },
    { within },
  );
  expect(small, where).toEqual([]);
}

async function mails(subject: RegExp) {
  const lines = (await readFile(E2E.mailFile, "utf8").catch(() => "")).trim().split("\n");
  return lines
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { to: string; subject: string; text: string })
    .filter((m) => subject.test(m.subject));
}

/** Presses a state on a section, in the map (laptop) or the list (phone and tablet). */
async function pick(page: Page, section: string, state: string) {
  const name = {
    system: "whole-staff-side",
    database: "database",
    search: "search",
    auth: "sign-in",
  }[section]!;
  await page.getByTestId(`pick-${name}-${state}`).first().click();
  await expect(page.getByTestId("switch-panel")).toBeVisible();
}

async function submitSwitch(page: Page, reason: string, confirm = false) {
  const panel = page.getByTestId("switch-panel");
  await panel.getByLabel("Reason (for the change log)").fill(reason);
  if (confirm) {
    await expect(panel.getByTestId("switch-submit")).toBeDisabled();
    await panel.getByLabel("Control passkey", { exact: true }).fill(CONTROL_PASSKEY);
    await panel.getByLabel("Type CONFIRM").fill("CONFIRM");
  }
  await panel.getByTestId("switch-submit").click();
  await expect(page.getByTestId("control-toast")).toBeVisible();
}

async function staffPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  // auth.spec.ts changes the shared passkey when the whole suite runs first
  for (const passkey of [E2E.passkey, "Brand-New-Passkey-1"]) {
    await signInStaff(page, E2E.staff.email, passkey);
    const codeBox = page.getByLabel("Sign-in code");
    await expect(codeBox.or(page.getByText("That email and passkey don't match"))).toBeVisible();
    if (await codeBox.isVisible()) break;
  }
  await completeEmailCode(page);
  return page;
}

let admin: Page;
let staff: Page;

test.beforeAll(async ({ browser }) => {
  staff = await staffPage(browser);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  admin = await context.newPage();
  await signInAdmin(admin);
});

test.afterAll(async () => {
  await admin?.context().close();
  await staff?.context().close();
});

test("the first visit sets the Control passkey, then the page opens", async () => {
  await admin.goto("/admin/control");
  await expect(admin.getByRole("heading", { name: "Set your Control passkey" })).toBeVisible();
  // It can't be the admin password
  await admin.getByLabel("Control passkey", { exact: true }).fill(E2E.admin.password);
  await admin.getByLabel("Type it again").fill(E2E.admin.password);
  await admin.getByRole("button", { name: "Set and open" }).click();
  await expect(admin.getByText(/different passkey from your admin password/)).toBeVisible();

  await admin.getByLabel("Control passkey", { exact: true }).fill(CONTROL_PASSKEY);
  await admin.getByLabel("Type it again").fill(CONTROL_PASSKEY);
  await admin.getByRole("button", { name: "Set and open" }).click();
  await expect(admin.getByText(/Unlocked until/)).toBeVisible();
  await expect(admin.getByTestId("control-overall")).toContainText("Everything is on");
  expect(await mails(/Control passkey set/)).toHaveLength(1);
});

for (const size of SIZES) {
  test(`the page fits and is accessible at ${size.name}`, async ({}, testInfo) => {
    await admin.setViewportSize({ width: size.width, height: size.height });
    await admin.goto("/admin/control");
    await expect(admin.getByText(/Unlocked until/)).toBeVisible();
    if (size.width >= 1024) await expect(admin.getByTestId("control-diagram")).toBeVisible();
    else await expect(admin.getByTestId("control-item-system")).toBeVisible();
    await noSideScroll(admin, `Control Center at ${size.name}`);
    await bigTargets(admin, `Control Center at ${size.name}`);
    await noViolations(admin, `Control Center at ${size.name}`);
    await admin.screenshot({
      path: testInfo.outputPath(`control-${size.name}.png`),
      fullPage: true,
    });

    // The switch form, opened from a section
    await pick(admin, "search", "hold");
    await noSideScroll(admin, `switch form at ${size.name}`);
    await bigTargets(admin, `switch form at ${size.name}`, "[data-testid=switch-panel]");
    await noViolations(admin, `switch form at ${size.name}`);
    await admin.getByTestId("switch-panel").getByRole("button", { name: "Cancel" }).click();
  });
}

test("Database on Hold: staff see the hold page, the admin dashboard keeps working", async () => {
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto("/admin/control");
  await pick(admin, "database", "hold");
  await admin
    .getByTestId("switch-panel")
    .getByLabel("Message staff see")
    .fill("Database maintenance, back in 30 minutes.");
  await submitSwitch(admin, "E2E database hold");
  await expect(admin.getByTestId("control-toast")).toContainText("Database: On → Hold");
  await expect(admin.getByTestId("control-item-search")).toContainText("Affected");

  // Staff: the list is replaced by the message
  await staff.goto("/certificates");
  const notice = staff.getByTestId("switch-notice");
  await expect(notice).toHaveAttribute("data-state", "hold");
  await expect(notice).toContainText("Database maintenance, back in 30 minutes.");
  await noSideScroll(staff, "staff hold page");
  await noViolations(staff, "staff hold page");

  // Before sign-in: the status note replaces the form
  const visitor = await staff.context().browser()!.newPage();
  await visitor.goto("/");
  await expect(visitor.getByTestId("switch-notice")).toContainText("Sign-in");
  await expect(visitor.getByLabel("Passkey", { exact: true })).toHaveCount(0);
  await visitor.close();

  // The admin dashboard still works
  await admin.goto("/admin");
  await expect(admin.getByTestId("control-banner")).toContainText("Database (Hold)");
  await admin.goto("/admin/certificates");
  await expect(admin.getByRole("heading", { name: "Certificates", level: 1 })).toBeVisible();

  // Back on
  await admin.goto("/admin/control");
  await pick(admin, "database", "on");
  await submitSwitch(admin, "E2E maintenance done");
  await staff.goto("/certificates");
  await expect(staff.getByTestId("switch-notice")).toHaveCount(0);
  await expect(staff.getByRole("heading", { name: "Certificates", level: 1 })).toBeVisible();

  expect((await mails(/switched: Database: On → Hold/)).length).toBeGreaterThan(0);
});

test("Down needs the passkey and CONFIRM, and Undo puts it back", async () => {
  await admin.goto("/admin/control");
  await pick(admin, "search", "down");
  await submitSwitch(admin, "E2E search down", true);
  await expect(admin.getByTestId("control-item-search")).toContainText("Down");
  await staff.goto("/certificates");
  await expect(staff.getByTestId("switch-notice")).toHaveAttribute("data-state", "down");

  await admin.getByTestId("control-toast").getByRole("button", { name: /Undo/ }).click();
  await expect(admin.getByTestId("control-toast")).toContainText("Undone");
  await expect(admin.getByTestId("control-item-search")).toContainText("On");
  await staff.goto("/certificates");
  await expect(staff.getByTestId("switch-notice")).toHaveCount(0);

  // Every change is in the log and the CSV
  await admin.reload();
  await expect(admin.getByTestId("control-log")).toContainText("E2E search down");
  const csv = await admin.request.get("/admin/control/log");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("control.undo");
});

test("a person on Hold sees the hold page; everyone else doesn't", async () => {
  await admin.goto("/admin/control");
  await admin.getByLabel("Who or what").selectOption("user");
  await admin.getByLabel("Person").selectOption({ label: E2E.staff.email });
  await admin.getByLabel("Message they see").fill("Your access is paused for an audit.");
  await admin.getByLabel("Reason (for the change log)").nth(0).fill("E2E person hold");
  await admin.getByRole("button", { name: "Set to Hold" }).click();
  await expect(admin.getByTestId("access-list")).toContainText(E2E.staff.email);

  await staff.goto("/certificates");
  await expect(staff.getByTestId("switch-notice")).toContainText("paused for an audit");

  await admin.getByTestId("access-list").getByRole("button", { name: "Switch on" }).click();
  await expect(admin.getByTestId("access-list")).toHaveCount(0);
  await staff.goto("/certificates");
  await expect(staff.getByTestId("switch-notice")).toHaveCount(0);
});

test("View as staff shows what staff see", async () => {
  await admin.goto("/admin/control");
  await pick(admin, "auth", "hold");
  await submitSwitch(admin, "E2E sign-in hold");
  const preview = admin.getByTestId("staff-preview");
  await expect(preview.getByText("Signing in").locator("..")).toContainText("Hold");
  await expect(preview.getByText("Certificate list and search").locator("..")).toContainText("On");
  // Signed-in staff keep working while only Sign-in is on Hold
  await staff.goto("/certificates");
  await expect(staff.getByTestId("switch-notice")).toHaveCount(0);
  await pick(admin, "auth", "on");
  await submitSwitch(admin, "E2E sign-in back");
});

test("3 wrong passkeys email a rescue link that turns everything back on", async () => {
  await admin.goto("/admin/control");
  await pick(admin, "search", "hold");
  await submitSwitch(admin, "E2E before rescue");
  await admin.getByRole("button", { name: "Lock now" }).click();
  await expect(admin.getByRole("heading", { name: /Locked/ })).toBeVisible();
  await noSideScroll(admin, "locked page");
  await noViolations(admin, "locked page");

  for (let i = 0; i < 3; i++) {
    await admin.getByLabel("Control passkey", { exact: true }).fill(`wrong-passkey-${i}`);
    await admin.getByRole("button", { name: "Unlock for 10 minutes" }).click();
    await expect(admin.getByText(`${4 - i} tries left`)).toBeVisible();
  }
  const rescue = (await mails(/emergency switch-on link/)).at(-1);
  expect(rescue?.to).toBe(E2E.admin.email);
  const link = rescue!.text.match(/\/admin\/control\/rescue\?t=[\w-]+/)![0];

  await admin.goto(link);
  await noSideScroll(admin, "rescue page");
  await admin.getByTestId("use-rescue").click();
  await expect(admin).toHaveURL(/\/admin\/control\?rescued=1$/);
  await expect(admin.getByText(/Everything is switched back on/)).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Set your Control passkey" })).toBeVisible();
  await staff.goto("/certificates");
  await expect(staff.getByTestId("switch-notice")).toHaveCount(0);

  // A used link can't be used again
  await admin.goto(link);
  await expect(admin.getByText(/already used/)).toBeVisible();

  await admin.goto("/admin/control");
  await admin.getByLabel("Control passkey", { exact: true }).fill(NEW_PASSKEY);
  await admin.getByLabel("Type it again").fill(NEW_PASSKEY);
  await admin.getByRole("button", { name: "Set and open" }).click();
  await expect(admin.getByText(/Unlocked until/)).toBeVisible();
});

test("Lock everything signs staff out; switching on lets them back in", async () => {
  await admin.goto("/admin/control");
  await admin.getByTestId("preset-lock-everything").click();
  await admin.getByLabel("Reason (for the change log)").first().fill("E2E lock everything");
  await admin.getByLabel("Control passkey", { exact: true }).fill(NEW_PASSKEY);
  await admin.getByLabel("Type CONFIRM").fill("CONFIRM");
  await admin.getByRole("button", { name: "Apply Lock everything" }).click();
  await expect(admin.getByTestId("control-toast")).toContainText("Whole staff side: On → Down");

  // The staff sign-in ended: they land on the sign-in page, which says why
  await staff.goto("/certificates");
  await expect(staff).toHaveURL(/\/$/);
  await expect(staff.getByTestId("switch-notice")).toHaveAttribute("data-state", "down");

  // The admin is never locked out
  await admin.goto("/admin/users");
  await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();

  await admin.goto("/admin/control");
  await pick(admin, "system", "on");
  await submitSwitch(admin, "E2E all back on");
  await expect(admin.getByTestId("control-overall")).toContainText("Everything is on");
  await staff.goto("/");
  await expect(staff.getByLabel("Passkey", { exact: true })).toBeVisible();
});
