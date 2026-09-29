import { test, expect } from "./fixtures/base";

test.describe("smoke", () => {
  test("home page renders", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });

  test("protected route redirects guest to signin with returnTo", async ({
    page,
  }) => {
    await page.goto("/messages");
    await expect(page).toHaveURL(/\/signin\?returnTo=%2Fmessages/);
  });
});
