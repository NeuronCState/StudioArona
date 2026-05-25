import { test, expect } from '@playwright/test';

/**
 * Data-state E2E tests
 *
 * Verifies the three UI states (loading / error / empty) that every
 * useQuery-powered page must handle correctly.
 *
 * Uses page.route() to intercept fetch calls at the Playwright level,
 * which takes priority over the in-browser MSW service worker.
 *
 * Target page: FeedsPage (the most representative data-fetching page).
 * Each test forces a specific network response to verify the matching
 * UI component renders.
 */

test.describe('Data states: loading → error → empty', () => {
  test.beforeEach(async ({ page }) => {
    // Login first so the auth store has a valid token
    await page.goto('/');
    await page.getByPlaceholder('输入用户名').fill('zhang');
    await page.getByPlaceholder('输入密码').fill('demo');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('今日概览')).toBeVisible({ timeout: 10000 });
  });

  test('loading state — shows CardSkeleton while API is slow', async ({ page }) => {
    // Intercept the feeds API and inject a 3-second delay.
    // This lets us observe the skeleton before the response arrives.
    await page.route('**/api/feeds*', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });

    // Navigate to feeds page — the request fires and we should see
    // the FeedsSkeleton component while waiting.
    await page.getByRole('link', { name: '信息源' }).click();

    // The skeleton should be visible within the first second (way before
    // the 3s delay resolves). We check for the skeleton's structure.
    // FeedsSkeleton renders Skeleton components — they're typically divs
    // with animate-pulse class from Tailwind.
    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 2000 });

    // After the 3s delay, real content should replace the skeleton.
    await expect(page.getByText('Hacker News')).toBeVisible({ timeout: 5000 });
  });

  test('error state — shows CardError with retry button on API 500', async ({ page }) => {
    // Force the feeds endpoint to return 500.
    await page.route('**/api/feeds*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL_ERROR', message: '服务暂时不可用' }),
      });
    });

    await page.getByRole('link', { name: '信息源' }).click();

    // CardError renders the error message (or a generic fallback).
    // The message from the API is '服务暂时不可用'.
    await expect(page.getByText('服务暂时不可用')).toBeVisible({ timeout: 5000 });

    // CardError must include a retry button.
    const retryButton = page.getByRole('button', { name: /重试|retry/i });
    await expect(retryButton).toBeVisible();
  });

  test('empty state — shows empty message when API returns []', async ({ page }) => {
    // Force the feeds endpoint to return an empty array.
    await page.route('**/api/feeds*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.getByRole('link', { name: '信息源' }).click();

    // FeedsPage renders empty state: "暂无 RSS 订阅" + hint text.
    await expect(page.getByText('暂无 RSS 订阅')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/添加 RSS 源来追踪/)).toBeVisible();
  });
});

test.describe('Data states: error recovery via retry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('输入用户名').fill('zhang');
    await page.getByPlaceholder('输入密码').fill('demo');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('今日概览')).toBeVisible({ timeout: 10000 });
  });

  test('retry button clears error and loads data', async ({ page }) => {
    let callCount = 0;

    // First call → 500, subsequent → real data
    await page.route('**/api/feeds*', async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INTERNAL_ERROR', message: '服务暂时不可用' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole('link', { name: '信息源' }).click();

    // Should see error state first.
    await expect(page.getByText('服务暂时不可用')).toBeVisible({ timeout: 5000 });

    // Click retry.
    await page.getByRole('button', { name: /重试|retry/i }).click();

    // After retry, should see real data (MSW returns Hacker News etc.).
    await expect(page.getByText('Hacker News')).toBeVisible({ timeout: 5000 });
  });
});
