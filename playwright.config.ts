import { defineConfig, devices, type Project } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
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

export const chromiumProjects: Project[] = viewports.map((v) => ({
  name: `chromium-${v.name}`,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: v.width, height: v.height },
    isMobile: v.mobile,
    hasTouch: v.mobile,
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
}));

// Safari (WebKit, used by every iPhone) and Firefox on key sizes: `pnpm test:e2e:all`.
export const otherBrowserProjects: Project[] = [
  { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  { name: "webkit-ipad", use: { ...devices["iPad (gen 7)"] } },
  { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
  {
    name: "firefox-phone-360",
    use: { ...devices["Desktop Firefox"], viewport: { width: 360, height: 640 } },
  },
  { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: chromiumProjects,
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
