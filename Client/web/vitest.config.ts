import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Standalone vitest config.
 *
 * Two environments:
 *   - jsdom (default): fast unit tests for pure logic / component rendering
 *   - browser (opt-in): real browser tests for IndexedDB, Canvas, Web Workers
 *
 * Use browser mode by adding `// @vitest-environment browser` at the top of
 * a test file. Browser tests run in a real Chromium instance via Playwright.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Default: jsdom for existing tests (fast, no browser overhead)
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**", "**/*.browser.test.*"],
    css: false,

    // Browser mode (Vitest 4) — activated per-file via:
    //   // @vitest-environment browser
    // Browser tests are excluded from default run; use `pnpm test:browser` instead.
    // Playwright provides the real Chromium instance.
    browser: {
      enabled: false, // off by default; per-file opt-in via @vitest-environment
      name: "chromium",
      provider: playwright,
      headless: true,
      screenshotFailures: true,
    },
  },
});
