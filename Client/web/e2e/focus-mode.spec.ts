import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?devbypass=1&setupbypass=1');
  await page.evaluate(() => localStorage.removeItem('studio-arona-focus-chats'));
  await page.reload();
});

test('enters focus mode, creates chats, and exits with Escape', async ({ page }) => {
  await page.getByRole('button', { name: '打开阿洛娜专注面板' }).click();

  const panel = page.getByRole('dialog', { name: '阿洛娜 专注面板' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Message input' })).toBeFocused();
  await expect(page.getByRole('complementary', { name: '专注侧栏' })).toBeVisible();
  const newChat = page.getByRole('button', { name: '新对话', exact: true });
  await expect(newChat).toBeVisible();

  await newChat.click();
  await expect(page.getByText('新对话 2')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: '打开阿洛娜专注面板' })).toBeVisible();
});
