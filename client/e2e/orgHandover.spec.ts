import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// #142 (PRD 0001 §5.1 E8-1, ADR 0003, ADR 0004): an Org Admin removes a departing Unit
// Contact and hands their items to another contact of the same unit. The seed
// (server/src/e2e/orgHandoverFixture.ts) has its own org so removing a member doesn't
// disturb the other org specs:
// - the leaver listed "E2E Handover item"; the requester's Approved Weave on it survives the removal
// - the leaver's own Requested request on the requester's item is declined automatically
// - after the handover, the successor gives the item and confirms the handoff
const ITEM = "E2E Handover item";
const RECEIVING_ITEM = "E2E Handover receiving item";
const admin = {
  email: "e2e-handover-admin@megaweave.test",
  password: "e2e-handover-admin-123",
};
const leaverEmail = "e2e-handover-leaver@megaweave.test";
const successor = {
  email: "e2e-handover-successor@megaweave.test",
  password: "e2e-handover-successor-123",
};
const requester = {
  email: "e2e-handover-requester@megaweave.test",
  password: "e2e-handover-requester-123",
};

interface WeaveSummary {
  id: number;
  status: string;
  giver_name: string;
  post: { title: string };
}

async function signedIn(credentials: { email: string; password: string }) {
  const context = await playwrightRequest.newContext({
    ignoreHTTPSErrors: true,
  });
  const res = await context.post(`${API_URL}/api/signin`, {
    data: credentials,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return context;
}

async function weaveOn(context: APIRequestContext, title: string) {
  const res = await context.get(`${API_URL}/api/weaves`);
  expect(res.ok(), await res.text()).toBeTruthy();
  const { weaves } = (await res.json()) as { weaves: WeaveSummary[] };
  return weaves.find((w) => w.post.title === title);
}

test.describe("Org Admin hands a departing contact's items to another contact", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // The auth rate limiter (10/min per IP) is shared with the other org specs
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("removing the contact declines their request and keeps the Approved Weave; the successor takes it over", async ({
    page,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: admin,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();

    await page.goto("/org-admin");
    const member = page
      .getByRole("listitem")
      .filter({ hasText: leaverEmail })
      .filter({
        has: page.getByRole("button", { name: zhTW.OrgAdmin.remove }),
      });
    page.once("dialog", (dialog) => void dialog.accept());
    await member.getByRole("button", { name: zhTW.OrgAdmin.remove }).click();
    await expect(page.getByText(zhTW.OrgAdmin.memberRemoved)).toBeVisible();

    const requesterApi = await signedIn(requester);
    try {
      // Requested → declined; Approved stays until it's finished
      expect(await weaveOn(requesterApi, RECEIVING_ITEM)).toMatchObject({
        status: "declined",
      });
      expect(await weaveOn(requesterApi, ITEM)).toMatchObject({
        status: "approved",
      });

      // The leaver shows up under pending handovers; hand their items to the successor
      const pending = page
        .getByRole("listitem")
        .filter({ hasText: leaverEmail })
        .filter({ hasText: zhTW.OrgAdmin.handover.leftOrg });
      await expect(pending).toContainText("E2E Handover Unit");
      await pending.getByRole("combobox").click();
      await page.getByRole("option", { name: successor.email }).click();
      await pending
        .getByRole("button", { name: zhTW.OrgAdmin.handover.submit })
        .click();
      await expect(page.getByText("已轉交 1 件物品、1 筆申請。")).toBeVisible();
      await expect(page.getByText(zhTW.OrgAdmin.handover.empty)).toBeVisible();

      // The successor now gives the item: both sides confirm and the Weave completes
      expect(await weaveOn(requesterApi, ITEM)).toMatchObject({
        status: "approved",
        giver_name: "E2E Handover Successor",
      });
      const successorApi = await signedIn(successor);
      try {
        const weave = await weaveOn(successorApi, ITEM);
        expect(weave).toBeTruthy();
        const confirmed = await successorApi.patch(
          `${API_URL}/api/weaves/${weave!.id}/status`,
          {
            data: { status: "completed" },
          },
        );
        expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
        const completed = await requesterApi.patch(
          `${API_URL}/api/weaves/${weave!.id}/status`,
          {
            data: { status: "completed" },
          },
        );
        expect(
          ((await completed.json()) as { fullyCompleted: boolean })
            .fullyCompleted,
        ).toBe(true);
      } finally {
        await successorApi.dispose();
      }
    } finally {
      await requesterApi.dispose();
    }
  });
});
