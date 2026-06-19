import { expect, test } from "@playwright/test";

test("loads the offline client and navigates between core pages", async ({
  page,
}) => {
  await page.goto("/?devbypass=1&setupbypass=1");

  const feedsLink = page.getByRole("link", { name: "信息源" });
  await expect(feedsLink).toBeVisible();

  await feedsLink.click();
  await expect(page).toHaveURL(/\/feeds$/);
  await expect(page.getByRole("heading", { name: "信息源" })).toBeVisible();

  await page.getByRole("link", { name: "日程" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
});
