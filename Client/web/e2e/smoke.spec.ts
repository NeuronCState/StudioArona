import { expect, test } from "@playwright/test";

test("loads the offline client and navigates between core pages", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:8081/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies: Record<string, unknown> = {
      "/api/providers": { providers: [] },
      "/api/config": {
        personas: { agents: "", soul: "", user: "" },
        credentials: {},
        tools: [],
        mcp_servers: {},
      },
      "/api/skills": { skills: [] },
      "/api/memories": { sections: [] },
    };
    await route.fulfill({ json: bodies[path] ?? {} });
  });

  await page.goto("/?devbypass=1&setupbypass=1");

  const feedsLink = page.getByRole("link", { name: "信息源" });
  await expect(feedsLink).toBeVisible();

  await feedsLink.click();
  await expect(page).toHaveURL(/\/feeds$/);
  await expect(page.getByRole("heading", { name: "信息源" })).toBeVisible();

  await page.getByRole("link", { name: "日程" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("heading", { name: "日程计划" })).toBeVisible();

  await page.getByRole("link", { name: "配置" }).click();
  await expect(page).toHaveURL(/\/config$/);
  await expect(page.getByRole("heading", { name: "配置" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "技能市场" })).toBeVisible();
});
