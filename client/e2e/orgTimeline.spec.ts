import { request as playwrightRequest } from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// #141 (PRD 0001 §5.1 E9-1, E9-3): the Unit Contact of "E2E Unit" lists an item with an asset
// number, the contact of "E2E Supply Unit" (server/src/e2e/orgIsolationFixture.ts ORG_LISTER)
// requests it on behalf of their unit, it is approved and handed over. In /org/items the row
// shows where it went, and its timeline shows every step with who did it. Org Members can't
// read the timeline.
const lister = {
  email: "e2e-org-lister@megaweave.test",
  password: "e2e-org-lister-123",
};
const member = {
  email: "e2e-org-member@megaweave.test",
  password: "e2e-org-member-123",
};
const viewer = {
  email: process.env.E2E_ORG_VIEWER_EMAIL ?? "",
  password: process.env.E2E_ORG_VIEWER_PASSWORD ?? "",
};
const SUPPLY_UNIT = "E2E Supply Unit";

test.describe("Org item timeline and where items went", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // The auth rate limiter (10/min per IP) is shared with the other org specs
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("a handed-over item shows the receiving unit and every step with its actor", async ({
    page,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: viewer,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgsRes = await page.request.get(`${API_URL}/api/orgs`);
    const org = (
      (await orgsRes.json()) as {
        orgs: Array<{ id: string; manageableUnits: Array<{ id: number }> }>;
      }
    ).orgs[0];
    expect(org).toBeTruthy();

    // The viewer lists an item for E2E Unit
    const title = `E2E Org Timeline ${Date.now()}`;
    const listed = await page.request.post(
      `${API_URL}/api/orgs/${org.id}/items`,
      {
        data: {
          unitId: org.manageableUnits[0].id,
          title,
          orgCategory: "display",
          quantity: 1,
          unitWeightKg: 5,
          conditionLevel: 2,
          assetNumber: "E2E-ASSET-141",
        },
      },
    );
    expect(listed.status(), await listed.text()).toBe(201);
    const itemId = ((await listed.json()) as { item: { id: string } }).item.id;

    const listerApi = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
    });
    const memberApi = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      // The Supply Unit's contact requests it on behalf of their unit
      const listerSignin = await listerApi.post(`${API_URL}/api/signin`, {
        data: lister,
      });
      expect(listerSignin.ok(), await listerSignin.text()).toBeTruthy();
      const detail = await listerApi.get(`${API_URL}/api/posts/${itemId}`);
      expect(detail.ok(), await detail.text()).toBeTruthy();
      const { post } = (await detail.json()) as { post: { id: number } };
      const units = await listerApi.get(
        `${API_URL}/api/weaves/acting-units?postId=${post.id}`,
      );
      const supply = (
        (await units.json()) as { units: Array<{ id: number; name: string }> }
      ).units.find((u) => u.name === SUPPLY_UNIT);
      expect(supply).toBeTruthy();
      const sent = await listerApi.post(`${API_URL}/api/weaves`, {
        data: {
          postId: post.id,
          items: [{ itemId: null, quantity: 1 }],
          actingUnitId: supply!.id,
        },
      });
      expect(sent.status(), await sent.text()).toBe(201);
      const weaveId = ((await sent.json()) as { weaveId: number }).weaveId;

      // Approved and handed over (both sides confirm)
      for (const [api, status] of [
        [page.request, "approved"],
        [page.request, "completed"],
        [listerApi, "completed"],
      ] as const) {
        const res = await api.patch(`${API_URL}/api/weaves/${weaveId}/status`, {
          data: { status },
        });
        expect(res.ok(), await res.text()).toBeTruthy();
      }

      // Org Members can't read the records
      const memberSignin = await memberApi.post(`${API_URL}/api/signin`, {
        data: member,
      });
      expect(memberSignin.ok(), await memberSignin.text()).toBeTruthy();
      const denied = await memberApi.get(
        `${API_URL}/api/orgs/${org.id}/items/${itemId}/timeline`,
      );
      expect(denied.status(), await denied.text()).toBe(403);
    } finally {
      await listerApi.dispose();
      await memberApi.dispose();
    }

    // The back office shows where it went, and its timeline
    await page.goto(`/org/items?org=${org.id}`);
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row.getByTestId("org-item-outcome")).toHaveText(
      `${SUPPLY_UNIT} × 1`,
    );
    await row
      .getByRole("button", { name: zhTW.Org.manage.viewTimeline })
      .click();

    const timeline = page.getByRole("region", {
      name: zhTW.Org.timeline.title,
    });
    const steps = timeline.getByRole("listitem");
    const kind = zhTW.Org.timeline.kind;
    await expect(steps).toHaveCount(5);
    await expect(steps.nth(0)).toContainText(kind.listed);
    await expect(steps.nth(0)).toContainText("E2E Org Viewer");
    await expect(steps.nth(0)).toContainText("E2E-ASSET-141");
    await expect(steps.nth(1)).toContainText(kind.requested);
    await expect(steps.nth(1)).toContainText("E2E Org Lister");
    await expect(steps.nth(1)).toContainText(SUPPLY_UNIT);
    await expect(steps.nth(2)).toContainText(kind.approved);
    await expect(steps.nth(2)).toContainText("E2E Org Viewer");
    await expect(steps.nth(3)).toContainText(kind.confirmed);
    await expect(steps.nth(4)).toContainText(kind.completed);
    await expect(steps.nth(4)).toContainText("E2E Org Lister");
    await expect(steps.nth(4)).toContainText(SUPPLY_UNIT);
  });
});
