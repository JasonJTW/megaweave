import { request as playwrightRequest } from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL, AUTH_FILE } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// #137 (PRD 0001 §5.1, ADR 0003, ADR 0004): a Unit Contact requests another unit's
// Internal item on behalf of their own unit. The seed (server/src/e2e/orgIsolationFixture.ts)
// lists "E2E Org Claim internal" in "E2E Supply Unit"; the org viewer is the contact of
// "E2E Unit", so they also have an Org Member identity and must choose who they represent.
// The Weave records the receiving unit. The default E2E user belongs to no org and gets 404.
// In the other direction, the Supply Unit contact requests the viewer's unit item and the
// viewer approves it in the back office without being the requester's DM partner.
const CLAIM_TITLE = "E2E Org Claim internal";
const VIEWER_UNIT_ITEM = "E2E Org Isolation internal";
// server/src/e2e/orgIsolationFixture.ts ORG_LISTER
const lister = {
  email: "e2e-org-lister@megaweave.test",
  password: "e2e-org-lister-123",
};
const viewer = {
  email: process.env.E2E_ORG_VIEWER_EMAIL ?? "",
  password: process.env.E2E_ORG_VIEWER_PASSWORD ?? "",
};

interface WeaveSummary {
  post_id: number;
  status: string;
  receiver_org_unit: { id: number; name: string } | null;
  post: { title: string };
}

test.describe("Unit Contact claims another unit's Internal item", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // The auth rate limiter (10/min per IP) is shared with the other org specs
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("the request is sent on behalf of the chosen unit; non-members get 404; the owning unit approves", async ({
    page,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: viewer,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();

    // Find the seeded item on the org page
    await page.goto("/org");
    const card = page.getByRole("link", { name: new RegExp(CLAIM_TITLE) });
    await expect(card).toContainText("E2E Supply Unit");
    const href = await card.getAttribute("href");
    const publicId = href?.match(/\/item\/([0-9a-f-]{36})/)?.[1];
    expect(publicId, `item link ${href}`).toBeTruthy();

    const currentUser = page.waitForResponse(
      (res) => res.url().endsWith("/api/currentUser") && res.ok(),
    );
    await page.goto(`/item/${publicId}`, { timeout: 30_000 });
    await currentUser;
    await page
      .getByRole("button", { name: zhTW.Comments.messageAboutItem })
      .filter({ visible: true })
      .first()
      .click();

    // Two identities → the "on behalf of" choice, with no default
    const actingAs = page.getByLabel(zhTW.Chat.postInfo.actingAs, {
      exact: true,
    });
    await expect(actingAs).toBeVisible({ timeout: 15_000 });
    const submit = page.getByRole("button", {
      name: "接收",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await actingAs.selectOption({ label: "E2E Unit" });
    await submit.click();
    await expect(page.getByText(zhTW.Chat.requestSent)).toBeVisible();
    // The popup persists across navigation; close it so it doesn't cover the back office
    await page.getByRole("button", { name: zhTW.Chat.close }).click();

    // The Weave records the person handling it and the unit the item flows to
    const weavesRes = await page.request.get(`${API_URL}/api/weaves`);
    expect(weavesRes.ok(), await weavesRes.text()).toBeTruthy();
    const { weaves } = (await weavesRes.json()) as { weaves: WeaveSummary[] };
    const weave = weaves.find((w) => w.post.title === CLAIM_TITLE);
    expect(weave).toMatchObject({
      status: "requested",
      receiver_org_unit: { name: "E2E Unit" },
    });

    // Someone outside the org can't request it: same 404 as a missing post
    const outsider = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
      storageState: AUTH_FILE,
    });
    try {
      const res = await outsider.post(`${API_URL}/api/weaves`, {
        data: {
          postId: weave!.post_id,
          items: [{ itemId: null, quantity: 1 }],
        },
      });
      expect(res.status(), await res.text()).toBe(404);
      expect(((await res.json()) as { code: string }).code).toBe(
        "POST_NOT_FOUND",
      );
    } finally {
      await outsider.dispose();
    }

    // The Supply Unit contact requests the viewer's unit item on behalf of their unit
    const viewerItemCard = page.getByRole("link", {
      name: new RegExp(VIEWER_UNIT_ITEM),
    });
    await page.goto("/org");
    const viewerItemHref = await viewerItemCard.getAttribute("href");
    const viewerItemId = viewerItemHref?.match(/\/item\/([0-9a-f-]{36})/)?.[1];
    const orgsRes = await page.request.get(`${API_URL}/api/orgs`);
    const orgId = ((await orgsRes.json()) as { orgs: Array<{ id: string }> })
      .orgs[0]?.id;
    expect(viewerItemId && orgId, `item link ${viewerItemHref}`).toBeTruthy();

    const requester = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      const signedIn = await requester.post(`${API_URL}/api/signin`, {
        data: lister,
      });
      expect(signedIn.ok(), await signedIn.text()).toBeTruthy();
      const detail = await requester.get(
        `${API_URL}/api/posts/${viewerItemId}`,
      );
      expect(detail.ok(), await detail.text()).toBeTruthy();
      const { post } = (await detail.json()) as {
        post: { id: number; items: Array<{ id: number }> };
      };
      const units = await requester.get(
        `${API_URL}/api/weaves/acting-units?postId=${post.id}`,
      );
      const supply = (
        (await units.json()) as { units: Array<{ id: number; name: string }> }
      ).units.find((u) => u.name === "E2E Supply Unit");
      expect(supply).toBeTruthy();
      const sent = await requester.post(`${API_URL}/api/weaves`, {
        data: {
          postId: post.id,
          items: [{ itemId: post.items[0].id, quantity: 1 }],
          actingUnitId: supply!.id,
        },
      });
      expect(sent.status(), await sent.text()).toBe(201);
    } finally {
      await requester.dispose();
    }

    // The viewer reviews it in the back office
    await page.goto(`/org/items?org=${orgId}`);
    const row = page.getByRole("row", { name: new RegExp(VIEWER_UNIT_ITEM) });
    await row.getByRole("button", { name: /筆待核可/ }).click();
    const request = page
      .getByRole("listitem")
      .filter({ hasText: "E2E Org Lister（代表E2E Supply Unit）" })
      .filter({ hasText: "待核可" })
      .first();
    await request.getByRole("button", { name: "核可", exact: true }).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "E2E Org Lister（代表E2E Supply Unit）" })
        .filter({ hasText: "已核可" })
        .first(),
    ).toBeVisible();
  });
});
