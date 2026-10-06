import path from "path";
import { API_URL, test, expect } from "./fixtures/auth";

const SAMPLE_IMAGE = path.join(__dirname, "fixtures/files/sample.jpg");

test.describe("create post", () => {
  test("shares an item with a photo and shows it in the feed", async ({
    page,
    request,
  }, testInfo) => {
    // Unique per project and retry so parallel runs never collide
    const title = `E2E ${testInfo.project.name} ${Date.now()}`;

    // Clicking before the session is loaded redirects to /signin
    const currentUser = page.waitForResponse(
      (res) => res.url().endsWith("/api/currentUser") && res.ok(),
    );
    await page.goto("/");
    await currentUser;
    // The home page runs in zh-TW on the unprefixed URL
    await page
      .getByRole("button", { name: "+ 分享" })
      .filter({ visible: true })
      .first()
      .click();

    const form = page.getByRole("dialog", { name: "share" });
    await form.locator("#image-upload").setInputFiles(SAMPLE_IMAGE);

    await form.getByRole("combobox").filter({ hasText: "Category" }).click();
    await page.getByRole("option", { name: "電器用品" }).click();
    await form.getByRole("combobox").filter({ hasText: "Condition" }).click();
    await page.getByRole("option", { name: /^近全新/ }).click();

    await form.getByPlaceholder("Title").fill(title);
    await form.getByPlaceholder("Location").fill("台北市信義區");
    await form.getByPlaceholder("description...").fill("Created by Playwright");

    await form.getByRole("button", { name: "Expiry date" }).click();
    await page.getByRole("button", { name: /next month/i }).click();
    await page.getByRole("gridcell", { name: "15" }).click();
    await page.keyboard.press("Escape");

    await form.getByRole("button", { name: "Post", exact: true }).click();

    await expect(page.getByText("貼文已發布！")).toBeVisible();
    await page.getByText(title).click();
    // The dev server compiles the post page on first visit
    await expect(page).toHaveURL(/\/item\/[\w-]+$/, { timeout: 20_000 });
    await expect(page.getByText(title).first()).toBeVisible();

    // The worker moves the photo out of staging asynchronously
    const publicId = new URL(page.url()).pathname.split("/").pop();
    await expect
      .poll(async () => {
        const res = await request.get(`${API_URL}/api/posts/${publicId}`);
        const { post } = await res.json();
        return post.images.map((image: { s3_key: string }) => image.s3_key);
      })
      .toEqual([expect.stringMatching(/^posts\/.+\.webp$/)]);
  });
});
