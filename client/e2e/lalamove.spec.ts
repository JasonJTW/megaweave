import { randomUUID } from "crypto";
import { API_URL, test, expect } from "./fixtures/auth";

test.describe("Lalamove delivery quote", () => {
  let publicId: string;

  test.beforeEach(async ({ page }) => {
    const unique = randomUUID().slice(0, 8);
    // A post with coordinates is the only thing that shows the quote panel
    const res = await page.request.post(`${API_URL}/api/posts`, {
      data: {
        title: `E2E Lalamove ${unique}`,
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
  });

  test("shows the quote panel in Chinese on the unprefixed post page", async ({
    page,
  }) => {
    await page.goto(`/item/${publicId}`);
    await expect(page.getByText("Lalamove 即時運費試算")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "展開試算" })).toBeVisible();
  });

  test("shows the quote panel in English on the /en post page", async ({
    page,
  }) => {
    await page.goto(`/en/item/${publicId}`);
    await expect(page.getByText("Lalamove Instant Delivery Quote")).toBeVisible(
      { timeout: 20_000 },
    );
    await expect(page.getByRole("button", { name: "Get Quote" })).toBeVisible();
  });
});
