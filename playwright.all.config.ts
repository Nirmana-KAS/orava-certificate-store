import { defineConfig } from "@playwright/test";

import base, {
  adminFlowProjects,
  baseProjects,
  chromiumProjects,
  controlProject,
  otherBrowserProjects,
} from "./playwright.config";

// Full matrix: 13 Chromium sizes plus Safari (WebKit) and Firefox. Run `pnpm test:e2e:all`.
// First time only: `pnpm exec playwright install webkit firefox`.
export default defineConfig({
  ...base,
  projects: [
    ...baseProjects,
    ...chromiumProjects,
    ...adminFlowProjects,
    ...otherBrowserProjects,
    // Runs last, after the other browsers too
    {
      ...controlProject,
      dependencies: [
        ...(controlProject.dependencies ?? []),
        ...otherBrowserProjects.map((p) => p.name!),
      ],
    },
  ],
});
