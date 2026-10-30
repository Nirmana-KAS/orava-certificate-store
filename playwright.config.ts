import { defineConfig, devices, type Project } from "@playwright/test";

import { appEnv, E2E } from "./tests/e2e/fixtures";

const PORT = E2E.appPort;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Responsive test matrix (PLAN.md §1b): every page is checked at each of these sizes.
 * Phones and tablets run with touch and a mobile user agent in Chromium.
 */
export const viewports = [
  { name: "phone-320", width: 320, height: 568, mobile: true },
  { name: "phone-360", width: 360, height: 640, mobile: true },
  { name: "phone-375", width: 375, height: 667, mobile: true },
  { name: "phone-390", width: 390, height: 844, mobile: true },
  { name: "phone-412", width: 412, height: 915, mobile: true },
  { name: "phone-430", width: 430, height: 932, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: true },
  { name: "tablet-820", width: 820, height: 1180, mobile: true },
  { name: "tablet-1024-landscape", width: 1024, height: 768, mobile: true },
  { name: "laptop-1280", width: 1280, height: 800, mobile: false },
  { name: "laptop-1440", width: 1440, height: 900, mobile: false },
  { name: "desktop-1920", width: 1920, height: 1080, mobile: false },
  { name: "phone-390-landscape", width: 844, height: 390, mobile: true },
] as const;

const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : undefined;

/** Signs in once as staff and as admin; the saved sessions are reused by page checks. */
const setupProject: Project = {
  name: "setup",
  testMatch: /auth\.setup\.ts/,
  use: { ...devices["Desktop Chrome"], launchOptions },
};

export const chromiumProjects: Project[] = viewports.map((v) => ({
  name: `chromium-${v.name}`,
  testMatch: /responsive\.spec\.ts/,
  dependencies: ["setup"],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: v.width, height: v.height },
    isMobile: v.mobile,
    hasTouch: v.mobile,
    launchOptions,
  },
}));

/** Sign-in flows, including ones that sign everyone out, so they run after the page checks. */
const flowProject: Project = {
  name: "auth-flows",
  testMatch: /auth\.spec\.ts/,
  dependencies: chromiumProjects.map((p) => p.name!),
  use: { ...devices["Pixel 7"], launchOptions },
};

// Safari (WebKit, used by every iPhone) and Firefox on key sizes: `pnpm test:e2e:all`.
const other = (name: string, use: Project["use"]): Project => ({
  name,
  testMatch: /responsive\.spec\.ts/,
  dependencies: ["setup"],
  use,
});
export const otherBrowserProjects: Project[] = [
  other("webkit-iphone", { ...devices["iPhone 15"] }),
  other("webkit-ipad", { ...devices["iPad (gen 7)"] }),
  other("webkit-desktop", { ...devices["Desktop Safari"] }),
  other("firefox-phone-360", {
    ...devices["Desktop Firefox"],
    viewport: { width: 360, height: 640 },
  }),
  other("firefox-desktop", { ...devices["Desktop Firefox"] }),
];

export const baseProjects = [setupProject, flowProject];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : "50%",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [...baseProjects, ...chromiumProjects],
  // Local Postgres (PGlite) with test accounts, then the production build of the app.
  // Run `pnpm build` first.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "node tests/e2e/db-server.ts",
          port: E2E.dbPort,
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          command: `pnpm start --port ${PORT}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: appEnv,
        },
      ],
});
