import { expect, test } from "@playwright/test";

test.describe("Login flow", () => {
  test("shows login page when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("什亭之匣")).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
    await expect(page.getByRole("button", { name: "注册" })).toBeVisible();
  });

  test("switches between login and register tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "注册" }).click();
    await expect(page.getByRole("button", { name: "注册" })).toHaveAttribute("aria-current", undefined);
    await expect(page.getByText("选择头像")).toBeVisible();

    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  });

  test("shows validation error on empty login submit", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "登录" }).click();
    // The form should show an error about empty fields
    await expect(
      page.locator("text=请输入用户名和密码")
    ).toBeVisible({ timeout: 5000 });
  });

  test("shows offline error when server is unreachable", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("用户名").fill("testuser");
    await page.getByLabel("密码").fill("testpass123");
    await page.getByRole("button", { name: "登录" }).click();
    // Server is not running, should show offline message
    const error = page.locator(".animate-shake");
    await expect(error).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Dev bypass", () => {
  test("enters app directly with devbypass", async ({ page }) => {
    await page.goto("/?devbypass=1&setupbypass=1");
    await expect(page).toHaveURL(/\/$/);
    // Should see the main app, not login page
    await expect(page.getByText("什亭之匣")).not.toBeVisible();
  });
});
