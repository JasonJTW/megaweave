import { test, expect } from "./fixtures/base";

test.describe("locale routing", () => {
  test("/ renders the zh-TW site", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    await expect(page.getByRole("button", { name: "開啟主選單" })).toBeAttached();
    await expect(page.getByRole("link", { name: "隱私權政策" })).toBeAttached();
  });

  test("/en renders the English site", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeAttached();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toBeAttached();
  });

  test("guest on /en/messages is sent to the English sign-in with returnTo", async ({
    page,
  }) => {
    await page.goto("/en/messages");
    await expect(page).toHaveURL(/\/en\/signin\?returnTo=%2Fen%2Fmessages$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("/zh-TW prefix redirects to the unprefixed URL", async ({ page }) => {
    await page.goto("/zh-TW/about");
    await expect(page).toHaveURL((url) => url.pathname === "/about");
  });

  test.describe("with an English browser", () => {
    test.use({
      locale: "en-US",
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });

    test("/ is not redirected to /en", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    });
  });
});
