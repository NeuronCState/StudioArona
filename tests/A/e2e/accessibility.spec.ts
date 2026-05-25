import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const CREDENTIALS = { username: 'zhang', password: 'demo' } as const;

async function login(page: Awaited<ReturnType<typeof test.createPage>>) {
  await page.goto('/');
  await page.getByPlaceholder('输入用户名').fill(CREDENTIALS.username);
  await page.getByPlaceholder('输入密码').fill(CREDENTIALS.password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByText('今日概览').waitFor({ state: 'visible', timeout: 10000 });
}

async function checkA11y(page: Awaited<ReturnType<typeof test.createPage>>) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  // M4 goal: 0 violations of any impact
  const violations = results.violations;
  if (violations.length > 0) {
    console.log(`A11y violations on ${page.url()}:`, JSON.stringify(violations, null, 2));
  }
  expect(violations).toEqual([]);
}

test.describe('Accessibility — 0 violations', () => {
  test.slow();

  test('Login page', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('输入用户名').waitFor({ state: 'visible' });
    await checkA11y(page);
  });

  test('Dashboard', async ({ page }) => {
    await login(page);
    await checkA11y(page);
  });

  test('Chat page (active mode)', async ({ page }) => {
    await login(page);
    await page.getByTestId('fake-wake-btn').click();
    await page.waitForTimeout(1500);
    await page.getByPlaceholder(/输入消息/).waitFor({ state: 'visible' });
    await checkA11y(page);
  });

  test('Memory page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: '记忆' }).click();
    await page.getByText('总记忆').waitFor({ state: 'visible', timeout: 5000 });
    await checkA11y(page);
  });

  test('Feeds page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: '信息源' }).click();
    await page.getByText('我的信息源').waitFor({ state: 'visible', timeout: 5000 });
    await checkA11y(page);
  });

  test('System page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: '系统' }).click();
    await page.getByText('硬件监控').waitFor({ state: 'visible', timeout: 5000 });
    await checkA11y(page);
  });

  test('VMs page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: '虚拟机' }).click();
    await page.getByText('虚拟机').first().waitFor({ state: 'visible', timeout: 5000 });
    await checkA11y(page);
  });

  test('Schedule page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: '日程' }).click();
    await page.getByText('日程').first().waitFor({ state: 'visible', timeout: 5000 });
    await checkA11y(page);
  });
});
