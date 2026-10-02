import { test, expect } from "./fixtures/auth";

test.describe("signed-in user", () => {
  test("can open a protected route", async ({ page }) => {
    await page.goto("/messages");
    await expect(page).toHaveURL(/\/messages/);
  });

  test("is redirected away from signin", async ({ page }) => {
    await page.goto("/signin");
    await expect(page).not.toHaveURL(/\/signin/);
  });
});
