import { randomUUID } from "crypto";
import {
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// A personal Weave through the WeavingCard in the chat (CONTEXT.md「Weave 狀態」):
// the buttons come from the server's `viewer.commands`, and a change made by the other
// party reaches an open card through the one weave_status_updated listener (lib/weave).
const card = zhTW.WeaveCard;

interface Party {
  name: string;
  api: APIRequestContext;
}

async function signUp(prefix: string): Promise<Party> {
  const name = `${prefix}-${randomUUID().slice(0, 8)}`;
  const api = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
  const res = await api.post(`${API_URL}/api/signup`, {
    data: {
      username: name,
      email: `${name}@megaweave.test`,
      password: "e2e-password-123",
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { name, api };
}

/** The author shares a post; the initiator requests it. Returns the weave and its conversation. */
async function requestedWeave(author: Party, initiator: Party) {
  const unique = randomUUID().slice(0, 8);
  const post = await author.api.post(`${API_URL}/api/posts`, {
    data: {
      title: `E2E Weave ${unique}`,
      content: "Created by Playwright",
      type: "share",
      categoryId: 1,
      conditionLevel: 2,
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      // Parallel workers inserting the same place_id race on the locations table
      place_id: `e2e-weave-${unique}`,
      location_name: "Taipei 101",
      full_address: "台北市信義區信義路五段7號",
      city: "台北市",
      lat: 25.0339,
      lng: 121.5645,
    },
  });
  expect(post.ok(), await post.text()).toBeTruthy();
  const { id: postId } = (await post.json()).post as { id: number };

  const request = await initiator.api.post(`${API_URL}/api/weaves`, {
    data: { postId, items: [] },
  });
  expect(request.ok(), await request.text()).toBeTruthy();
  const { weaveId } = (await request.json()) as { weaveId: number };

  const detail = await initiator.api.get(`${API_URL}/api/weaves/${weaveId}`);
  expect(detail.ok(), await detail.text()).toBeTruthy();
  const { conversation_id: conversationId } = (await detail.json()).weave as {
    conversation_id: number;
  };
  return { weaveId, conversationId };
}

/** Opens the chat as `party` (copies their session cookie into the browser). */
async function openChatAs(page: Page, party: Party, conversationId: number) {
  await page.context().clearCookies();
  await page.context().addCookies((await party.api.storageState()).cookies);
  await page.goto(`/messages/${conversationId}`, { timeout: 30_000 });
}

function weaveCard(page: Page, weaveId: number) {
  return page.locator(`#weave-card-${weaveId}`);
}

test.describe("personal Weave lifecycle in the chat", () => {
  // Shares the auth rate limiter (10/min per IP) with the other specs: run once
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  let author: Party;
  let initiator: Party;

  test.beforeAll(async () => {
    author = await signUp("e2e-weave-author");
    initiator = await signUp("e2e-weave-initiator");
  });

  test.afterAll(async () => {
    await author?.api.dispose();
    await initiator?.api.dispose();
  });

  test("the author approves, both confirm, and the other party's confirm reaches the open card", async ({
    page,
  }) => {
    const { weaveId, conversationId } = await requestedWeave(author, initiator);
    page.on("dialog", (dialog) => void dialog.accept());

    await openChatAs(page, author, conversationId);
    const authorCard = weaveCard(page, weaveId);
    await expect(authorCard.getByText(card.status.newRequest)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      authorCard.getByRole("button", { name: card.actions.withdraw }),
    ).toHaveCount(0);
    await authorCard
      .getByRole("button", { name: card.actions.approve })
      .click();
    await expect(page.getByText(card.toast.approved)).toBeVisible();
    await expect(authorCard.getByText(card.status.weaving)).toBeVisible();

    // The initiator confirms receipt elsewhere; the author's open card follows without a reload
    const confirm = await initiator.api.patch(
      `${API_URL}/api/weaves/${weaveId}/status`,
      {
        data: { status: "completed" },
      },
    );
    expect(confirm.ok(), await confirm.text()).toBeTruthy();
    await expect(
      authorCard.getByText(
        card.hint.approved.receiverConfirmedPleaseConfirmHandover.replace(
          "{name}",
          initiator.name,
        ),
      ),
    ).toBeVisible({ timeout: 15_000 });

    await authorCard
      .getByRole("button", { name: card.actions.confirm })
      .click();
    await expect(page.getByText(card.toast.completed)).toBeVisible();
    await expect(authorCard.getByText(card.status.weaved)).toBeVisible();
    await expect(
      authorCard.getByRole("button", { name: card.actions.cancel }),
    ).toHaveCount(0);
  });

  test("the initiator withdraws a request; an approved one can be cancelled", async ({
    page,
  }) => {
    page.on("dialog", (dialog) => void dialog.accept());

    const withdrawn = await requestedWeave(author, initiator);
    await openChatAs(page, initiator, withdrawn.conversationId);
    const requestCard = weaveCard(page, withdrawn.weaveId);
    await expect(requestCard.getByText(card.status.requestSent)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      requestCard.getByRole("button", { name: card.actions.approve }),
    ).toHaveCount(0);
    await requestCard
      .getByRole("button", { name: card.actions.withdraw })
      .click();
    await expect(page.getByText(card.toast.withdrawn)).toBeVisible();
    await expect(requestCard.getByText(card.status.withdrawn)).toBeVisible();

    const cancelled = await requestedWeave(author, initiator);
    const approve = await author.api.patch(
      `${API_URL}/api/weaves/${cancelled.weaveId}/status`,
      {
        data: { status: "approved" },
      },
    );
    expect(approve.ok(), await approve.text()).toBeTruthy();
    await openChatAs(page, initiator, cancelled.conversationId);
    const approvedCard = weaveCard(page, cancelled.weaveId);
    await approvedCard
      .getByRole("button", { name: card.actions.cancel })
      .click();
    await expect(page.getByText(card.toast.cancelled)).toBeVisible();
    await expect(approvedCard.getByText(card.status.cancelled)).toBeVisible();
  });
});
