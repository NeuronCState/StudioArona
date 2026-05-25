import { test, expect } from '@playwright/test';

test.describe('Journey 1: Login → all pages smoke', () => {
  test('login and navigate all pages', async ({ page }) => {
    await page.goto('/');

    // Login page
    await expect(page.getByText('工作室贾维斯')).toBeVisible();
    await expect(page.getByRole('tab', { name: '登录' })).toBeVisible();

    // Login
    await page.getByPlaceholder('输入用户名').fill('zhang');
    await page.getByPlaceholder('输入密码').fill('demo');
    await page.getByRole('button', { name: '登录' }).click();

    // Dashboard
    await expect(page.getByText('今日概览')).toBeVisible({ timeout: 10000 });

    // Navigate pages via sidebar
    const pages = [
      { label: '记忆', title: '记忆' },
      { label: '日程', title: '日程' },
      { label: '信息源', title: '我的信息源' },
      { label: '系统', title: '硬件监控' },
      { label: '虚拟机', title: '虚拟机' },
      { label: '语音', title: null }, // fullscreen overlay, no title
    ];

    for (const p of pages) {
      await page.getByRole('link', { name: p.label }).click();
      if (p.title) {
        await expect(page.getByText(p.title)).toBeVisible({ timeout: 5000 });
      } else {
        // Voice page is fullscreen overlay
        await expect(page.getByText('点击开始语音对话')).toBeVisible({ timeout: 5000 });
        // Exit voice mode
        await page.keyboard.press('Escape');
      }
    }

    // Navigate back to chat
    await page.getByRole('link', { name: '对话' }).click();
    await expect(page.getByText('今日概览')).toBeVisible();
  });
});

test.describe('Journey 2: Wake → chat → stream', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('输入用户名').fill('zhang');
    await page.getByPlaceholder('输入密码').fill('demo');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('今日概览')).toBeVisible({ timeout: 10000 });
  });

  test('fake wake → chat mode → send message', async ({ page }) => {
    await page.getByTestId('fake-wake-btn').click();
    await expect(page.getByText('正在唤醒...')).toBeVisible();
    await page.waitForTimeout(1500);

    // Chat input visible
    await expect(page.getByPlaceholder(/输入消息/)).toBeVisible();

    // Send a message
    await page.getByPlaceholder(/输入消息/).fill('你好');
    await page.getByRole('button', { name: '发送消息' }).click();

    // User message visible
    await expect(page.getByText('你好')).toBeVisible();

    // Streaming response
    await expect(page.getByText(/我是 Javis/)).toBeVisible({ timeout: 5000 });
  });
});
