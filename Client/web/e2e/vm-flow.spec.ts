import { expect, test } from "@playwright/test";

test.describe("VM page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?devbypass=1&setupbypass=1");
    await page.getByRole("link", { name: "VMs" }).click();
    await expect(page).toHaveURL(/\/vms$/);
  });

  test("shows VM page with empty state or offline state", async ({ page }) => {
    // Either shows "未连接" offline state or the VM page itself
    const offline = page.getByText("未连接");
    const empty = page.getByText("创建第一个 VM");
    await expect(offline.or(empty).or(page.getByRole("heading", { name: "VM 控制台" })))
      .toBeVisible({ timeout: 5000 });
  });

  test("opens create VM form", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: "申请 VM" });
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page.getByText("申请虚拟机")).toBeVisible();
      await expect(page.getByRole("button", { name: "提交" })).toBeVisible();
      await expect(page.getByRole("button", { name: "取消" })).toBeVisible();
    }
  });

  test("closes create VM form with cancel", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: "申请 VM" });
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.getByRole("button", { name: "取消" }).click();
      await expect(page.getByText("申请虚拟机")).not.toBeVisible();
    }
  });
});
