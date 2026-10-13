import { test as guestTest } from "./fixtures/base";
import { hasTestUser, test, testUser, expect } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";

// Each flow runs once per language, driven by that language's catalog.
// zh-TW is unprefixed (ADR 0002). `logIn` restates the login button on purpose:
// the selectors read the catalog, so one literal per locale is what proves the copy.
const LOCALES = [
  { locale: "zh-TW", prefix: "", messages: zhTW, logIn: "登入" },
  { locale: "en", prefix: "/en", messages: en, logIn: "Log in" },
] as const;

for (const { locale, prefix, messages, logIn } of LOCALES) {
  const home = prefix || "/";

  test.describe(`signed-in user (${locale})`, () => {
    test("can open a protected route", async ({ page }) => {
      await page.goto(`${prefix}/messages`);
      await expect(page).toHaveURL((url) => url.pathname === `${prefix}/messages`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });

    test("is redirected away from signin", async ({ page }) => {
      await page.goto(`${prefix}/signin`);
      await expect(page).not.toHaveURL(/\/signin/);
      await expect(page).toHaveURL((url) => url.pathname === home);
    });

    test("sees the settings page in the page language", async ({ page }) => {
      await page.goto(`${prefix}/user`);
      await expect(
        page.getByText(messages.UserSettings.contactSettings, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(messages.Profile.aboutMe, { exact: true }),
      ).toBeVisible();
    });
  });

  guestTest.describe(`guest (${locale})`, () => {
    guestTest("sees the sign-in page in the page language", async ({ page }) => {
      await page.goto(`${prefix}/signin`);
      const copy = messages.Auth;
      await expect(page.getByRole("button", { name: logIn, exact: true }).first()).toBeVisible();
      await expect(page.getByPlaceholder(copy.emailPlaceholder)).toBeVisible();
      await expect(page.getByPlaceholder(copy.passwordPlaceholder)).toBeVisible();
      await expect(
        page.getByRole("button", { name: copy.logInWithGoogle }),
      ).toBeVisible();

      await page.getByRole("button", { name: copy.register, exact: true }).click();
      await expect(page.getByPlaceholder(copy.usernamePlaceholder)).toBeVisible();
      await expect(
        page.locator("form").getByRole("button", { name: copy.signUp, exact: true }),
      ).toBeVisible();
    });

    guestTest("sees the sign-up page in the page language", async ({ page }) => {
      await page.goto(`${prefix}/signup`);
      const copy = messages.Auth;
      await expect(
        page.getByRole("heading", { name: copy.signUpTitle }),
      ).toBeVisible();
      await expect(page.getByPlaceholder(copy.usernamePlaceholder)).toBeVisible();
      await expect(page.getByRole("link", { name: copy.signIn })).toHaveAttribute(
        "href",
        `${prefix}/signin`,
      );
    });

    guestTest("signs in and returns to the page in the same language", async ({
      page,
    }) => {
      guestTest.skip(!hasTestUser, "E2E_USER_EMAIL / E2E_USER_PASSWORD not set");
      const copy = messages.Auth;

      // Typing before hydration is lost to React state; the session check runs once hydrated
      const hydrated = page.waitForResponse((res) =>
        res.url().endsWith("/api/currentUser"),
      );
      await page.goto(`${prefix}/user`);
      await expect(page).toHaveURL((url) => url.pathname === `${prefix}/signin`);
      await hydrated;

      await page.getByPlaceholder(copy.emailPlaceholder).fill(testUser.email);
      await page.getByPlaceholder(copy.passwordPlaceholder).fill(testUser.password);
      await page.locator("form").getByRole("button", { name: logIn, exact: true }).click();

      await expect(page).toHaveURL((url) => url.pathname === `${prefix}/user`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(
        page.getByText(messages.UserSettings.contactSettings, { exact: true }),
      ).toBeVisible();
    });
  });
}
