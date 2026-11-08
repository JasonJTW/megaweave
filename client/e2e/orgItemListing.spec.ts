import { request as playwrightRequest } from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL, AUTH_FILE } from "./fixtures/auth";

// #136 (PRD 0001 §5.1, ADR 0003): a Unit Contact lists an org item on behalf of their
// unit. It starts in the Internal tier, so it shows on the org page for the org's
// Unit Contacts and Org Admins only, and never in the home feed or search.
// The Unit Contact is the seeded org viewer (server/src/e2e/orgIsolationFixture.ts):
// the contact of "E2E Unit" in "E2E Org". The outsider is the default E2E user,
// who belongs to no org.
const viewer = {
  email: process.env.E2E_ORG_VIEWER_EMAIL ?? "",
  password: process.env.E2E_ORG_VIEWER_PASSWORD ?? "",
};

test.describe("Unit Contact lists an org item", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // One run is enough: the auth rate limiter (10/min per IP) is shared with the
  // UI sign-in specs, and the org isolation spec signs the same viewer in
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("it appears on the org page for the Unit Contact and stays hidden from non-members", async ({
    page,
    browser,
  }) => {
    const title = `E2E Org Item ${Date.now()}`;

    // Sign the browser context in as the Unit Contact (page.request shares its cookies)
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: viewer,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();

    await page.goto("/org");
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Org", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "上架物品" }).click();
    await expect(page).toHaveURL(/\/org\/items\/new\?org=/);

    // The only unit the contact represents is preselected
    await expect(page.getByLabel("代表單位")).toContainText("E2E Unit");

    // The category prefills its default weight from the factor table
    await page.getByLabel("物品類別").click();
    await page.getByRole("option", { name: "辦公椅", exact: true }).click();
    await expect(page.getByLabel("單件重量（公斤）")).toHaveValue("13.8");

    await page.getByLabel("物品名稱").fill(title);
    await page.getByLabel("說明").fill("Seeded by the org item listing spec");
    await page.getByLabel("物品狀況").click();
    await page.getByRole("option").first().click();
    await page.getByLabel("數量").fill("2");
    await page.getByLabel("財產編號（選填）").fill("E2E-ASSET-001");
    await page.getByRole("button", { name: "上架", exact: true }).click();

    // Back on the org page, the new item is there and marked Internal
    await expect(page).toHaveURL(/\/org\?org=/);
    const card = page.getByRole("link", { name: new RegExp(title) });
    await expect(card).toBeVisible();
    await expect(card).toContainText("內部單位");
    await expect(card).toContainText("E2E Unit");

    const href = await card.getAttribute("href");
    const postId = href?.match(/\/item\/([0-9a-f-]{36})/)?.[1];
    expect(postId, `item link ${href}`).toBeTruthy();
    const orgId = new URL(page.url()).searchParams.get("org");
    expect(orgId).toBeTruthy();

    // The back office lists it with the asset number
    await page.goto(`/org/items?org=${orgId}`);
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toContainText("E2E-ASSET-001");
    await expect(row).toContainText("13.8 公斤");

    // Non-members: no org page, no detail, not in the home feed or search
    const outsider = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
      storageState: AUTH_FILE,
    });
    const guest = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      const orgPosts = await outsider.get(`${API_URL}/api/orgs/${orgId}/posts`);
      expect(orgPosts.status(), await orgPosts.text()).toBe(404);
      expect(((await orgPosts.json()) as { code: string }).code).toBe(
        "ORG_NOT_FOUND",
      );

      for (const client of [outsider, guest]) {
        const detail = await client.get(`${API_URL}/api/posts/${postId}`);
        expect(detail.status(), await detail.text()).toBe(404);

        for (const path of [
          `/api/posts/feed?limit=50`,
          `/api/posts/feed?limit=50&search=${encodeURIComponent(title)}`,
          `/api/posts?limit=50&search=${encodeURIComponent(title)}`,
        ]) {
          const res = await client.get(`${API_URL}${path}`);
          expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
          const titles = (
            (await res.json()) as { posts: Array<{ title: string }> }
          ).posts.map((p) => p.title);
          expect(titles, path).not.toContain(title);
        }
      }

      // The outsider's own org page shows no org at all
      const outsiderBrowser = await browser.newContext({
        storageState: AUTH_FILE,
        ignoreHTTPSErrors: true,
        locale: "zh-TW",
        extraHTTPHeaders: { "Accept-Language": "zh-TW,zh;q=0.9" },
      });
      try {
        const outsiderPage = await outsiderBrowser.newPage();
        await outsiderPage.addInitScript(() => {
          window.localStorage.setItem("megaweave_tour_seen", "true");
        });
        await outsiderPage.goto(`${new URL(page.url()).origin}/org`);
        await expect(
          outsiderPage.getByText("你目前不屬於任何組織。"),
        ).toBeVisible();
        await expect(outsiderPage.getByText(title)).toHaveCount(0);
      } finally {
        await outsiderBrowser.close();
      }
    } finally {
      await outsider.dispose();
      await guest.dispose();
    }
  });
});
