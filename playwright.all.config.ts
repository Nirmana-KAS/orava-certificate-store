import { defineConfig } from "@playwright/test";

import base, { chromiumProjects, otherBrowserProjects } from "./playwright.config";

// Full matrix: 13 Chromium sizes plus Safari (WebKit) and Firefox. Run `pnpm test:e2e:all`.
// First time only: `pnpm exec playwright install webkit firefox`.
export default defineConfig({
  ...base,
  projects: [...chromiumProjects, ...otherBrowserProjects],
});
