import { test, expect } from '@playwright/test';

test.describe('Journey 3: RSS add → detail view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('用户名').fill('zhang');
    await page.getByLabel('密码').fill('demo');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('今日概览')).toBeVisible();
  });

  test('add RSS feed and view detail', async ({ page }) => {
    // Navigate to feeds page
    await page.getByRole('link', { name: '信息源' }).click();
    await expect(page.getByText('我的信息源')).toBeVisible();

    // Click add RSS
    await page.getByRole('button', { name: '添加 RSS' }).click();
    await expect(page.getByText('你也可以直接对 Javis 说')).toBeVisible();

    // Fill in RSS URL and add
    await page.getByPlaceholder('RSS URL').fill('https://example.com/rss');
    await page.getByRole('button', { name: '添加' }).click();

    // Should see the new feed
    await expect(page.getByText('example.com')).toBeVisible();

    // Click on a feed card to go to detail
    await page.locator('.card').filter({ hasText: 'example.com' }).click();

    // Should see detail view with back button
    await expect(page.getByText('MiniMax-M2.7')).toBeVisible();
    await expect(page.getByText('返回信息源')).toBeVisible();

    // Go back
    await page.getByText('返回信息源').click();
    await expect(page.getByText('我的信息源')).toBeVisible();
  });

  test('schedule timeline shown on feeds page', async ({ page }) => {
    await page.getByRole('link', { name: '信息源' }).click();

    // Should see schedule section
    await expect(page.getByText('完成 ChatPage 流式渲染')).toBeVisible();
  });
});

test.describe('Journey 5: VM create → terminal → destroy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('用户名').fill('zhang');
    await page.getByLabel('密码').fill('demo');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('今日概览')).toBeVisible();
  });

  test('create VM and view details', async ({ page }) => {
    // Navigate to VMs page
    await page.getByRole('link', { name: '虚拟机' }).click();
    await expect(page.getByText('虚拟机')).toBeVisible();

    // Should see existing VMs
    await expect(page.getByText('li-dev')).toBeVisible();
    await expect(page.getByText('wang-cuda')).toBeVisible();

    // Click create VM
    await page.getByRole('button', { name: '申请 VM' }).click();
    await expect(page.getByText('申请虚拟机')).toBeVisible();

    // Fill form
    await page.getByPlaceholder('my-vm').fill('test-vm');
    await page.getByRole('button', { name: '提交' }).click();

    // Should see new VM in list
    await expect(page.getByText('test-vm')).toBeVisible();
  });

  test('view VM detail with terminal and destroy', async ({ page }) => {
    await page.getByRole('link', { name: '虚拟机' }).click();

    // Click on a running VM
    await page.locator('.card').filter({ hasText: 'li-dev' }).click();

    // Should see detail view
    await expect(page.getByText('li-dev')).toBeVisible();
    await expect(page.getByText('SSH: localhost:2222')).toBeVisible();

    // Mock terminal should be visible
    await expect(page.getByText('Welcome to Ubuntu')).toBeVisible();

    // Type in terminal
    await page.keyboard.type('ls');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Desktop  Documents')).toBeVisible();

    // Destroy VM
    await page.getByRole('button', { name: '销毁' }).click();
    await page.getByRole('button', { name: '确认销毁' }).click();

    // Should be back to list
    await expect(page.getByText('虚拟机')).toBeVisible();
  });
});

test.describe('Journey 4: Schedule from chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('用户名').fill('zhang');
    await page.getByLabel('密码').fill('demo');
    await page.getByRole('button', { name: '登录' }).click();
  });

  test('wake → chat → verify schedule in timeline', async ({ page }) => {
    // Wake up
    await page.getByTestId('fake-wake-btn').click();
    await page.waitForTimeout(1500);

    // Send schedule-related message
    await page.getByPlaceholder('输入消息...').fill('明天上午10点开团队站会');
    await page.getByRole('button', { name: '发送消息' }).click();

    // Verify response came
    await expect(page.getByText('我是 Javis')).toBeVisible({ timeout: 5000 });

    // Navigate to feeds page to verify schedules
    await page.getByRole('link', { name: '信息源' }).click();

    // Should see schedule section
    await expect(page.getByText('共享日程')).toBeVisible();
  });
});
