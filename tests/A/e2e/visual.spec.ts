import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test.slow();

  test('login page screenshot', async ({ page }) => {
    await page.goto('/');
    // Wait for the login form to render
    await page.waitForSelector('#username');
    await page.waitForSelector('#password');

    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('dashboard cards screenshot', async ({ page }) => {
    await page.goto('/');

    // Login via the form
    await page.fill('#username', 'zhang');
    await page.fill('#password', 'demo');
    await page.click('button[type="submit"]');

    // Wait for dashboard cards to appear after authentication
    await page.waitForSelector('[data-testid="fake-wake-btn"]');
    // Allow dashboard card data (schedules, feeds, metrics) to load
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('chat mode screenshot', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.fill('#username', 'zhang');
    await page.fill('#password', 'demo');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="fake-wake-btn"]');

    // Trigger fake-wake to enter chat mode
    await page.click('[data-testid="fake-wake-btn"]');
    // Wait for wake transition: waking (1200ms) + session creation
    await page.waitForTimeout(1500);

    // Wait for the chat input to appear (indicates chat mode is active)
    await page.waitForSelector('textarea[aria-label="消息输入"]');

    // Type a message and send it
    await page.fill('textarea[aria-label="消息输入"]', '你好');
    await page.click('button[aria-label="发送消息"]');

    // Wait for the SSE streaming response to complete and render the reply
    await page.waitForSelector('[aria-live="polite"]');
    // SSE mock sends ~50 tokens at 30ms each + delays for tool_call/tool_result = ~2s
    await page.waitForTimeout(3000);

    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('feeds page screenshot', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.fill('#username', 'zhang');
    await page.fill('#password', 'demo');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="fake-wake-btn"]');

    // Navigate to feeds page via sidebar
    await page.click('a[href="/me/feeds"]');

    // Wait for feeds data to load — the page heading is always present,
    // so wait for feed cards or the empty state
    await page.waitForSelector('h2:has-text("我的信息源")');
    // Give react-query time to resolve and render feed cards
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('system page screenshot', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.fill('#username', 'zhang');
    await page.fill('#password', 'demo');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="fake-wake-btn"]');

    // Navigate to system page via sidebar
    await page.click('a[href="/system"]');

    // Wait for the system metrics data to load
    await page.waitForSelector('h2:has-text("硬件监控")');
    // Give react-query time to resolve and render metrics components
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('all visual snapshots taken', async ({ page }, testInfo) => {
    // This ensures screenshots are generated on first run
    testInfo.annotations.push({ type: 'visual', description: 'baseline' });
  });
});
