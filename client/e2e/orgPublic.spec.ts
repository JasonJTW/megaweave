import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL, testUser } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// #140 (PRD 0001 §5.1 E2-7, E4-2,「公開層顯示」; ADR 0003, ADR 0004): the demo org's admin
// (server/src/e2e/orgPublicFixture.ts) makes a Members item public from the back office. The item
// has an asset number, so the disposal has to be confirmed first. It waits in Pending Public, and
// the demo org's skip button publishes it at once. Afterwards the home feed shows it under the
// org's name, and nowhere public (feed, detail page, SEO title, API JSON, chat) shows the Unit
// Contact who listed it. A second item is sent to Pending Public and cancelled.
// Going public needs a pickup location, expiry date and category like a regular post: the
// fixture seeds them (there is no Google place picker in E2E), so the confirmation shows them
// prefilled; a third item without them can't be sent.
const ORG_NAME = "E2E Public Org";
const ITEM_TITLE = "E2E Org Public item";
const ITEM_ASSET = "E2E-ASSET-140";
const CANCEL_TITLE = "E2E Org Public cancel item";
const INCOMPLETE_TITLE = "E2E Org Public incomplete item";
const ITEM_ADDRESS = "110台北市信義區信義路五段7號";
const CONTACT_NAME = "E2E Hidden Contact Person";
const admin = {
  email: "e2e-public-admin@megaweave.test",
  password: "e2e-public-admin-123",
};
const contact = {
  email: "e2e-public-contact@megaweave.test",
  password: "e2e-public-contact-123",
};
const m = zhTW.Org.manage;

async function signedIn(credentials: {
  email: string;
  password: string;
}): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
  const res = await api.post(`${API_URL}/api/signin`, { data: credentials });
  expect(res.ok(), await res.text()).toBeTruthy();
  return api;
}

test.describe("Org Admin makes an item public", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // The auth rate limiter (10/min per IP) is shared with the other org specs
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("after the pending period it is in the home feed under the org's name, never the contact's", async ({
    page,
    browser,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: admin,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgs = (await (
      await page.request.get(`${API_URL}/api/orgs`)
    ).json()) as {
      orgs: Array<{ id: string; name: string; isDemo: boolean }>;
    };
    const org = orgs.orgs.find((o) => o.name === ORG_NAME);
    expect(org?.isDemo).toBe(true);

    await page.goto(`/org/items?org=${org!.id}`);
    const row = page.getByRole("row", { name: new RegExp(ITEM_TITLE) });
    await row.getByRole("button", { name: m.makePublic }).click();

    // The confirmation lists the name and asset number and needs the disposal confirmed
    const confirm = row.getByRole("group", {
      name: m.publicConfirmTitle.replace("{title}", ITEM_TITLE),
    });
    await expect(confirm.getByText(ITEM_ASSET)).toBeVisible();
    // The public listing saved earlier is prefilled
    await expect(confirm.getByLabel(m.publicListingLocation)).toHaveValue(
      ITEM_ADDRESS,
    );
    await expect(confirm.getByText("#E2E")).toBeVisible();
    const submit = confirm.getByRole("button", { name: m.publicConfirmSubmit });
    await expect(submit).toBeDisabled();
    await confirm.getByLabel(m.publicConfirmDisposal).check();
    await submit.click();
    await expect(page.getByText(m.pendingPublicStarted)).toBeVisible();

    // Pending Public: still Members, and not in the public feed yet
    await expect(row.getByTestId("org-pending-public")).toBeVisible();
    await expect(row.getByText(zhTW.Org.tier.members)).toBeVisible();
    const anonymous = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
    });
    try {
      const feedTitles = async () => {
        const res = await anonymous.get(`${API_URL}/api/posts/feed?limit=50`);
        expect(res.ok(), await res.text()).toBeTruthy();
        return (
          (await res.json()) as { posts: Array<{ title: string }> }
        ).posts.map((p) => p.title);
      };
      expect(await feedTitles()).not.toContain(ITEM_TITLE);

      // Demo orgs can skip the wait
      await row.getByRole("button", { name: m.skipPendingPublic }).click();
      await expect(page.getByText(m.publishedNow)).toBeVisible();
      await expect(row.getByText(zhTW.Org.tier.public)).toBeVisible();

      // The public API shows the org and nothing of the contact
      const feed = await anonymous.get(`${API_URL}/api/posts/feed?limit=50`);
      const feedJson = await feed.text();
      const posts = (
        JSON.parse(feedJson) as {
          posts: Array<{
            title: string;
            public_id: string;
            username: string;
            author_public_id: string;
          }>;
        }
      ).posts;
      const published = posts.find((p) => p.title === ITEM_TITLE);
      expect(published).toMatchObject({
        username: ORG_NAME,
        author_public_id: expect.stringMatching(/^org-post:/),
      });
      expect(feedJson).not.toContain(CONTACT_NAME);
      const detail = await anonymous.get(
        `${API_URL}/api/posts/${published!.public_id}`,
      );
      const detailJson = await detail.text();
      expect(detailJson).toContain(ORG_NAME);
      expect(detailJson).not.toContain(CONTACT_NAME);
      expect(detailJson).not.toContain(contact.email);

      // Home feed and detail page, as a guest
      const guest = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        // Same first-visit overlay skip as the base fixture
        await guest.addInitScript(() => {
          window.localStorage.setItem("megaweave_tour_seen", "true");
        });
        const guestPage = await guest.newPage();
        await guestPage.goto("/");
        const card = guestPage.getByText(ITEM_TITLE).first();
        await card.scrollIntoViewIfNeeded({ timeout: 15_000 });
        await expect(card).toBeVisible();
        // The card's poster (avatar) is the org
        await expect(guestPage.getByTitle(ORG_NAME).first()).toBeVisible();
        await expect(guestPage.getByTitle(CONTACT_NAME)).toHaveCount(0);
        await expect(guestPage.getByText(CONTACT_NAME)).toHaveCount(0);

        await guestPage.goto(`/item/${published!.public_id}`);
        await expect(guestPage.getByText(ORG_NAME).first()).toBeVisible();
        await expect(guestPage.getByText(CONTACT_NAME)).toHaveCount(0);
        // SEO metadata
        await expect(guestPage).toHaveTitle(new RegExp(ORG_NAME));
        expect(await guestPage.title()).not.toContain(CONTACT_NAME);
      } finally {
        await guest.close();
      }

      // A member of the public messages the item: the contact's account receives it, but the
      // public side only ever sees the org
      if (testUser.email) {
        const publicUser = await signedIn(testUser);
        const contactApi = await signedIn(contact);
        try {
          const sent = await publicUser.post(`${API_URL}/api/messages`, {
            multipart: {
              recipient_public_id: published!.author_public_id,
              content: "還在嗎？",
            },
          });
          expect(sent.status(), await sent.text()).toBe(201);
          const conversationsJson = await (
            await publicUser.get(`${API_URL}/api/messages/conversations`)
          ).text();
          const conversation = (
            JSON.parse(conversationsJson) as {
              conversations: Array<{
                id: number;
                other_username: string;
                other_public_id: string;
              }>;
            }
          ).conversations.find((c) => c.other_username === ORG_NAME);
          expect(conversation?.other_public_id).toMatch(/^org-conv:/);
          expect(conversationsJson).not.toContain(CONTACT_NAME);

          // The contact gets it and replies in the same conversation
          const contactConversations = (await (
            await contactApi.get(`${API_URL}/api/messages/conversations`)
          ).json()) as {
            conversations: Array<{
              id: number;
              other_public_id: string;
              last_message_content: string;
            }>;
          };
          const inbox = contactConversations.conversations.find(
            (c) => c.id === conversation!.id,
          );
          expect(inbox?.last_message_content).toBe("還在嗎？");
          const reply = await contactApi.post(`${API_URL}/api/messages`, {
            multipart: {
              recipient_public_id: inbox!.other_public_id,
              content: "還在",
            },
          });
          expect(reply.status(), await reply.text()).toBe(201);
          const historyJson = await (
            await publicUser.get(
              `${API_URL}/api/messages/conversations/${conversation!.id}`,
            )
          ).text();
          expect(historyJson).toContain("還在");
          expect(historyJson).not.toContain(CONTACT_NAME);
        } finally {
          await publicUser.dispose();
          await contactApi.dispose();
        }
      }
    } finally {
      await anonymous.dispose();
    }
  });

  test("Pending Public can be cancelled and the item keeps its tier", async ({
    page,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: admin,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgs = (await (
      await page.request.get(`${API_URL}/api/orgs`)
    ).json()) as {
      orgs: Array<{ id: string; name: string }>;
    };
    const org = orgs.orgs.find((o) => o.name === ORG_NAME)!;

    await page.goto(`/org/items?org=${org.id}`);
    const row = page.getByRole("row", { name: new RegExp(CANCEL_TITLE) });
    await row.getByRole("button", { name: m.makePublic }).click();
    await row.getByRole("button", { name: m.publicConfirmSubmit }).click();
    await expect(row.getByTestId("org-pending-public")).toBeVisible();

    await row.getByRole("button", { name: m.cancelPendingPublic }).click();
    await expect(page.getByText(m.pendingPublicCancelled)).toBeVisible();
    await expect(row.getByTestId("org-pending-public")).toHaveCount(0);
    await expect(row.getByText(zhTW.Org.tier.members)).toBeVisible();
    await expect(row.getByRole("button", { name: m.makePublic })).toBeVisible();
  });

  test("an item without a pickup location and expiry date can't be sent to Pending Public", async ({
    page,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: admin,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgs = (await (
      await page.request.get(`${API_URL}/api/orgs`)
    ).json()) as {
      orgs: Array<{ id: string; name: string }>;
    };
    const org = orgs.orgs.find((o) => o.name === ORG_NAME)!;

    await page.goto(`/org/items?org=${org.id}`);
    const row = page.getByRole("row", { name: new RegExp(INCOMPLETE_TITLE) });
    await row.getByRole("button", { name: m.makePublic }).click();
    const confirm = row.getByRole("group", {
      name: m.publicConfirmTitle.replace("{title}", INCOMPLETE_TITLE),
    });
    await expect(confirm.getByLabel(m.publicListingLocation)).toHaveValue("");

    // Typing an address without picking a suggestion is not a location
    await confirm.getByLabel(m.publicListingLocation).fill("台北市信義區");
    await confirm.getByRole("button", { name: m.publicConfirmSubmit }).click();
    await expect(
      confirm.getByText(m.publicListingLocationMissing),
    ).toBeVisible();
    await expect(confirm.getByText(m.publicListingExpiryMissing)).toBeVisible();
    await expect(row.getByTestId("org-pending-public")).toHaveCount(0);
  });
});
