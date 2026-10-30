import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { pages, storageFor } from "./pages";

const MIN_TARGET = 44;

for (const page of pages) {
  test.describe(`${page.name} (${page.path})`, () => {
    test.use({ storageState: storageFor(page.as) ?? { cookies: [], origins: [] } });

    test.beforeEach(async ({ page: p }) => {
      const response = await p.goto(page.path);
      await p.waitForLoadState("networkidle");
      // Make sure we are checking the intended page, not a sign-in redirect
      expect(new URL(p.url()).pathname).toBe(page.path);
      expect(response?.status()).toBe(page.name === "not-found" ? 404 : 200);
    });

    test("has no horizontal scrolling", async ({ page: p }) => {
      const overflow = await p.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, "page is wider than the screen").toBeLessThanOrEqual(0);
    });

    test("has no element sticking out past the screen edge", async ({ page: p }) => {
      const offenders = await p.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
          .filter((el) => {
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") return false;
            if (el.closest(".sr-only")) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > width + 1 || r.left < -1);
          })
          .map((el) => el.outerHTML.slice(0, 120));
      });
      expect(offenders).toEqual([]);
    });

    test(`touch targets are at least ${MIN_TARGET}px`, async ({ page: p }) => {
      const small = await p.evaluate((min) => {
        const selector = "button, input:not([type=hidden]), select, textarea, [role=button], a";
        return Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter((el) => {
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") return false;
            if (el.classList.contains("sr-only")) return false;
            // Links inside running text are exempt (WCAG 2.5.8 inline exception)
            if (el.tagName === "A" && el.closest("p, li")) return false;
            // A checkbox or radio inside its label is tapped through the whole label
            const target =
              el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)
                ? (el.closest("label") ?? el)
                : el;
            const r = target.getBoundingClientRect();
            return r.width > 0 && (r.width < min || r.height < min);
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)}: ${el.outerHTML.slice(0, 80)}`;
          });
      }, MIN_TARGET);
      expect(small).toEqual([]);
    });

    test("passes automated accessibility checks (WCAG 2.2 AA)", async ({ page: p }) => {
      const results = await new AxeBuilder({ page: p })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });

    test("background is white", async ({ page: p }) => {
      const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe("rgb(255, 255, 255)");
    });

    test("screenshot", async ({ page: p }, testInfo) => {
      await p.screenshot({
        path: testInfo.outputPath(`${page.name}.png`),
        fullPage: true,
      });
    });
  });
}
