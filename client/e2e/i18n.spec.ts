import type { Page } from "@playwright/test";
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

test.describe("language switcher", () => {
  test("footer switcher keeps the page, query and hash in the other language", async ({
    page,
  }) => {
    await page.goto("/about?ref=e2e#our-team");
    await page.getByRole("contentinfo").getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/about\?ref=e2e#our-team$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("contentinfo").getByRole("link", { name: "繁體中文" }).click();
    await expect(page).toHaveURL(/\/about\?ref=e2e#our-team$/);
    await expect(page).toHaveURL((url) => !url.pathname.startsWith("/en"));
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  });

  test("menu switcher moves to the English page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "開啟主選單" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("Switch to English prompt", () => {
  const prompt = (page: Page) =>
    page.getByRole("complementary", { name: "Switch to English?" });

  // The prompt is decided after hydration; settle first so absence checks mean something
  const expectNoPrompt = async (page: Page) => {
    await page.waitForLoadState("networkidle");
    await expect(prompt(page)).toHaveCount(0);
  };

  test("is not shown to a browser that prefers Chinese", async ({ page }) => {
    await page.goto("/about");
    await expectNoPrompt(page);
  });

  test.describe("with an English browser", () => {
    test.use({
      locale: "en-US",
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });

    test("is offered on zh-TW pages and leads to the English page", async ({ page }) => {
      await page.goto("/about");
      await prompt(page).getByRole("button", { name: "Switch" }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/en/about");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });

    test("is not offered in reverse on English pages", async ({ page }) => {
      await page.goto("/en/about");
      await expectNoPrompt(page);
    });

    test("stays dismissed without redirecting", async ({ page }) => {
      await page.goto("/about");
      await prompt(page).getByRole("button", { name: "Dismiss" }).click();
      await expect(prompt(page)).toHaveCount(0);

      await page.goto("/");
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
      await expectNoPrompt(page);
    });
  });
});

test.describe("localized metadata", () => {
  test("/ has a zh-TW title and hreflang alternates", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/免費物品交換與共享平台/);
    await expect(
      page.locator('link[rel="alternate"][hreflang="zh-TW"]'),
    ).toHaveAttribute("href", /\/$|localhost:3100$/);
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", /\/en$/);
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveAttribute("href", /localhost:3100$/);
  });

  test("/en has an English title and hreflang alternates", async ({ page }) => {
    await page.goto("/en");
    await expect(page).toHaveTitle(/free item exchange and sharing/i);
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", /\/en$/);
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveAttribute("href", /localhost:3100$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/en$/,
    );
  });

  test("a sub page localizes its title and canonical per language", async ({
    page,
  }) => {
    await page.goto("/about");
    await expect(page).toHaveTitle(/關於我們/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/about$/,
    );

    await page.goto("/en/about");
    await expect(page).toHaveTitle(/About Us/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/en\/about$/,
    );
  });

  test("the sitemap lists both languages of every public page", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBeTruthy();
    const xml = await response.text();
    for (const path of ["", "/en", "/about", "/en/about", "/tinder", "/en/tinder"]) {
      expect(xml).toContain(`<loc>https://localhost:3100${path}</loc>`);
    }
    expect(xml).toContain('hreflang="x-default"');
    expect(xml).not.toContain("/messages");
    expect(xml).not.toContain("/Card");
  });
});
