/**
 * Vitest Browser Mode config — real Chromium tests via Playwright provider.
 *
 * Run with: pnpm test:browser
 *
 * Only includes test files with the `*.browser.test.*` naming pattern.
 * These tests run in a real browser, not jsdom — ideal for:
 *   - IndexedDB (Dexie) transactional integrity
 *   - Canvas / WebGL (Three.js / PixiJS)
 *   - Web Workers
 *   - real DOM layout and paint behavior
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Only run browser-specific test files
    include: ["src/**/*.browser.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,

    // Browser mode — uses real Chromium via Playwright
    browser: {
      enabled: true,
      name: "chromium",
      provider: playwright,
      headless: true,
      screenshotFailures: true,
    },
  },
});
