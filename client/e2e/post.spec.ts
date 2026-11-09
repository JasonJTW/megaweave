import path from "path";
import { API_URL, test, expect } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";

const SAMPLE_IMAGE = path.join(__dirname, "fixtures/files/sample.jpg");

// The flow runs once per language, driven by that language's catalog so the spec
// follows the translations instead of restating them. zh-TW is unprefixed (ADR 0002).
const LOCALES = [
  // `heading` restates the form title on purpose: the rest of the spec reads its
  // selectors from the catalog, so one literal per locale is what proves the copy.
  { locale: "zh-TW", home: "/", messages: zhTW, heading: "分享" },
  { locale: "en", home: "/en", messages: en, heading: "Share" },
] as const;

// Seeded reference data the form needs: category id 1 and condition level 2
const CATEGORY_ID = "1";
const CONDITION_LEVEL = "2";

for (const { locale, home, messages, heading } of LOCALES) {
  test.describe(`create post (${locale})`, () => {
    test("shares an item with a photo and opens its detail page", async ({
      page,
      request,
    }, testInfo) => {
      const copy = messages.PostForm;
      // Unique per locale, project and retry so parallel runs never collide
      const title = `E2E ${locale} ${testInfo.project.name} ${Date.now()}`;

      // Clicking before the session is loaded redirects to /signin
      const currentUser = page.waitForResponse(
        (res) => res.url().endsWith("/api/currentUser") && res.ok(),
      );
      await page.goto(home);
      await currentUser;
      await page
        .getByRole("button", { name: messages.HomeFeed.share })
        .filter({ visible: true })
        .first()
        .click();

      expect(copy.titleShare).toBe(heading);
      const form = page.getByRole("dialog", { name: heading });
      await form.locator("#image-upload").setInputFiles(SAMPLE_IMAGE);

      await form
        .getByRole("combobox")
        .filter({ hasText: copy.categoryPlaceholder })
        .click();
      await page
        .getByRole("option", { name: messages.Categories[CATEGORY_ID] })
        .click();
      await form
        .getByRole("combobox")
        .filter({ hasText: copy.conditionPlaceholder })
        .click();
      await page
        .getByRole("option", {
          name: messages.Conditions[CONDITION_LEVEL].name,
          exact: false,
        })
        .click();

      await form.getByPlaceholder(copy.titlePlaceholder).fill(title);
      await form
        .getByPlaceholder(copy.locationPlaceholder)
        .fill("台北市信義區");
      await form
        .getByPlaceholder(copy.descriptionPlaceholder)
        .fill("Created by Playwright");

      await form.getByRole("button", { name: copy.expiryDate }).click();
      await page.getByRole("button", { name: copy.nextMonth }).click();
      await page.getByRole("gridcell", { name: "15" }).click();
      await page.keyboard.press("Escape");

      // The new post's id comes from the create response. The spec opens its detail
      // page directly instead of waiting for it in the feed: the personalized feed
      // only lists posts the worker has already embedded, so finding it there meant
      // reloading and scrolling until indexing caught up, which was slow and flaky.
      const created = page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/posts",
      );
      await form
        .getByRole("button", { name: copy.submit, exact: true })
        .click();
      const response = await created;
      expect(response.status()).toBe(201);
      const publicId: string = (await response.json()).post.public_id;

      await expect(page.getByText(messages.HomeFeed.postCreated)).toBeVisible();
      await page.goto(`${home === "/" ? "" : home}/item/${publicId}`);
      await expect(page.getByText(title).first()).toBeVisible();
      // Post detail chrome is translated; the title the user typed is not
      await expect(
        page.getByRole("button", { name: messages.PostDetail.edit }),
      ).toBeVisible();

      // The worker moves the photo out of staging asynchronously; under load the queue
      // can take longer than the default 5s
      await expect
        .poll(
          async () => {
            const res = await request.get(`${API_URL}/api/posts/${publicId}`);
            const { post } = await res.json();
            return post.images.map((image: { s3_key: string }) => image.s3_key);
          },
          { timeout: 20_000 },
        )
        .toEqual([expect.stringMatching(/^posts\/.+\.webp$/)]);
    });
  });
}
