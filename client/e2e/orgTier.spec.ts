import { request as playwrightRequest } from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// #138 (PRD 0001 §5.1 E2-2, ADR 0003): the Unit Contact of "E2E Unit" releases the seeded
// Internal item "E2E Org Tier internal" to Members from the back office. Before that the
// seeded Org Member (server/src/e2e/orgIsolationFixture.ts ORG_MEMBER) neither sees it on the
// org page nor can request it; afterwards they see it and can request it personally. The
// change is in the tier history, and a Unit Contact can't move it back down.
const TIER_TITLE = "E2E Org Tier internal";
// server/src/e2e/orgIsolationFixture.ts ORG_MEMBER
const member = {
  email: "e2e-org-member@megaweave.test",
  password: "e2e-org-member-123",
};
const viewer = {
  email: process.env.E2E_ORG_VIEWER_EMAIL ?? "",
  password: process.env.E2E_ORG_VIEWER_PASSWORD ?? "",
};

test.describe("Unit Contact releases an item to Members", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // The auth rate limiter (10/min per IP) is shared with the other org specs
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("Org Members see and can request it only after the release; the change is recorded", async ({
    page,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: viewer,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgsRes = await page.request.get(`${API_URL}/api/orgs`);
    const orgId = ((await orgsRes.json()) as { orgs: Array<{ id: string }> })
      .orgs[0]?.id;
    expect(orgId).toBeTruthy();

    const memberApi = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      const memberSignin = await memberApi.post(`${API_URL}/api/signin`, {
        data: member,
      });
      expect(memberSignin.ok(), await memberSignin.text()).toBeTruthy();
      const memberSees = async () => {
        const res = await memberApi.get(`${API_URL}/api/orgs/${orgId}/posts`);
        expect(res.ok(), await res.text()).toBeTruthy();
        const { posts } = (await res.json()) as {
          posts: Array<{ id: string; title: string }>;
        };
        return posts.find((p) => p.title === TIER_TITLE);
      };
      expect(await memberSees()).toBeUndefined();

      // Release it in the back office
      await page.goto(`/org/items?org=${orgId}`);
      const row = page.getByRole("row", { name: new RegExp(TIER_TITLE) });
      await row
        .getByRole("button", { name: zhTW.Org.manage.promoteToMembers })
        .click();
      await expect(page.getByText(zhTW.Org.manage.promoted)).toBeVisible();
      await expect(row.getByText(zhTW.Org.tier.members)).toBeVisible();
      // A Unit Contact can't move it back down
      await expect(
        row.getByRole("button", { name: zhTW.Org.manage.demoteToInternal }),
      ).toHaveCount(0);

      // The Org Member sees it now and can request it personally
      const released = await memberSees();
      expect(released).toBeTruthy();
      const detail = await memberApi.get(
        `${API_URL}/api/posts/${released!.id}`,
      );
      expect(detail.ok(), await detail.text()).toBeTruthy();
      const { post } = (await detail.json()) as {
        post: { id: number; items: Array<{ id: number }> };
      };
      const sent = await memberApi.post(`${API_URL}/api/weaves`, {
        data: {
          postId: post.id,
          items: [{ itemId: post.items[0].id, quantity: 1 }],
        },
      });
      expect(sent.status(), await sent.text()).toBe(201);

      // The tier history records who released it, from where to where
      const events = await page.request.get(
        `${API_URL}/api/orgs/${orgId}/items/${released!.id}/tier-events`,
      );
      expect(events.ok(), await events.text()).toBeTruthy();
      expect(
        ((await events.json()) as { events: unknown[] }).events,
      ).toMatchObject([
        {
          fromTier: "internal",
          toTier: "members",
          actor: { type: "user", name: "E2E Org Viewer" },
        },
      ]);

      // Moving it down is for Org Admins only
      const demote = await page.request.patch(
        `${API_URL}/api/orgs/${orgId}/items/${released!.id}/tier`,
        { data: { tier: "internal" } },
      );
      expect(demote.status(), await demote.text()).toBe(403);
      expect(((await demote.json()) as { code: string }).code).toBe(
        "ORG_TIER_NOT_ALLOWED",
      );
    } finally {
      await memberApi.dispose();
    }
  });
});
