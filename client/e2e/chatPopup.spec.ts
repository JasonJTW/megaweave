import { randomUUID } from "crypto";
import { request as playwrightRequest } from "@playwright/test";
import { API_URL, test, expect } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

test.describe("chat popup", () => {
  let publicId: string;
  let authorName: string;

  // The test user can't message their own post, so each test gets a post
  // from a freshly signed-up author.
  test.beforeEach(async () => {
    const unique = randomUUID().slice(0, 8);
    authorName = `e2e-author-${unique}`;

    const author = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      const signup = await author.post(`${API_URL}/api/signup`, {
        data: {
          username: authorName,
          email: `${authorName}@megaweave.test`,
          password: "e2e-password-123",
        },
      });
      expect(signup.ok(), await signup.text()).toBeTruthy();

      const res = await author.post(`${API_URL}/api/posts`, {
        data: {
          title: `E2E Chat ${unique}`,
          content: "Created by Playwright",
          type: "share",
          categoryId: 1,
          conditionLevel: 2,
          expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          // Parallel workers inserting the same place_id race on the locations table
          place_id: `e2e-taipei-101-${unique}`,
          location_name: "Taipei 101",
          full_address: "台北市信義區信義路五段7號",
          city: "台北市",
          lat: 25.0339,
          lng: 121.5645,
        },
      });
      expect(res.ok(), await res.text()).toBeTruthy();
      ({ public_id: publicId } = (await res.json()).post);
    } finally {
      await author.dispose();
    }
  });

  test("opens from the item comments, survives a reload, and closes", async ({
    page,
  }) => {
    const header = page.getByRole("heading", { level: 2, name: authorName });
    const closeButton = page.getByRole("button", { name: zhTW.Chat.close });

    // Clicking before the session is loaded redirects to /signin
    const currentUser = page.waitForResponse(
      (res) => res.url().endsWith("/api/currentUser") && res.ok(),
    );
    // The dev server compiles the post page on first visit
    await page.goto(`/item/${publicId}`, { timeout: 30_000 });
    await currentUser;

    await page
      .getByRole("button", { name: zhTW.Comments.messageAboutItem })
      .filter({ visible: true })
      .first()
      .click();

    await expect(header).toBeVisible({ timeout: 15_000 });
    // Opening from a post seeds the weaving draft, which shows the post card
    await expect(page.getByText(zhTW.Chat.postInfo.selectedAll)).toBeVisible();

    // Popup state is restored from sessionStorage after a reload
    await page.reload();
    await expect(header).toBeVisible({ timeout: 15_000 });

    await closeButton.click();
    await expect(header).toBeHidden();

    // Closing clears the persisted state, so the popup stays closed
    await page.reload();
    await expect(
      page.getByRole("button", { name: zhTW.Comments.messageAboutItem }).first(),
    ).toBeAttached({ timeout: 15_000 });
    await expect(header).toBeHidden();
  });
});
