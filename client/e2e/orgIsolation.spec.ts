import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL } from "./fixtures/auth";

// `npm run e2e:seed` creates one org with an Internal, a Members and a Public post,
// plus a personal post, all sharing one embedding (server/src/e2e/orgIsolationFixture.ts).
// The viewer is an Internal-access Unit Contact of that org whose interest vector
// matches the fixture, so every recommendation path ranks the fixture posts first.
// Prototype rule (ADR 0003): even members never see Internal / Members posts in the
// public feed, search, trending or recommendations; only the org page shows them.
const FIXTURE = {
  internal: "E2E Org Isolation internal",
  members: "E2E Org Isolation members",
  public: "E2E Org Isolation public",
  personal: "E2E Org Isolation personal",
};
const SEARCH_TERM = "E2E Org Isolation";

const viewer = {
  email: process.env.E2E_ORG_VIEWER_EMAIL ?? "",
  password: process.env.E2E_ORG_VIEWER_PASSWORD ?? "",
};

interface FeedPost {
  title: string;
}

async function titlesFrom(
  api: APIRequestContext,
  path: string,
): Promise<string[]> {
  const response = await api.get(`${API_URL}${path}`);
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  const body = (await response.json()) as { posts: FeedPost[] };
  return body.posts.map((post) => post.title);
}

function expectOnlyPublicFixtures(titles: string[]): void {
  expect(titles).toContain(FIXTURE.public);
  expect(titles).toContain(FIXTURE.personal);
  expect(titles).not.toContain(FIXTURE.internal);
  expect(titles).not.toContain(FIXTURE.members);
}

// Pure API checks: one browser project is enough
test.describe("Org posts below Public stay out of public surfaces", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "API-only spec",
  );

  let guest: APIRequestContext;
  let member: APIRequestContext;

  test.beforeAll(async () => {
    guest = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
    member = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
    const signin = await member.post(`${API_URL}/api/signin`, { data: viewer });
    expect(signin.ok(), await signin.text()).toBeTruthy();
  });

  test.afterAll(async () => {
    await guest?.dispose();
    await member?.dispose();
  });

  const paths: Array<[string, string]> = [
    ["trending feed (feed:trending)", "/api/posts/feed?limit=50"],
    ["filtered feed", "/api/posts/feed?limit=50&type=share"],
    ["tinder feed", "/api/posts/feed?limit=50&mode=tinder"],
    ["nearby feed", "/api/posts/feed?limit=50&lat=25.0339&lng=121.5645"],
    [
      "semantic search",
      `/api/posts/feed?limit=50&search=${encodeURIComponent(SEARCH_TERM)}`,
    ],
    [
      "keyword post list",
      `/api/posts?limit=50&search=${encodeURIComponent(SEARCH_TERM)}`,
    ],
  ];

  for (const [name, path] of paths) {
    test(`guest: ${name}`, async () => {
      expectOnlyPublicFixtures(await titlesFrom(guest, path));
    });

    test(`org member: ${name}`, async () => {
      expectOnlyPublicFixtures(await titlesFrom(member, path));
    });
  }

  test("org member: personalized vector feed", async () => {
    const response = await member.get(`${API_URL}/api/posts/feed?limit=50`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as {
      posts: FeedPost[];
      isPersonalized: boolean;
    };
    // The fixture gives the viewer an interest vector, so this is the KNN path
    expect(body.isPersonalized).toBe(true);
    expectOnlyPublicFixtures(body.posts.map((post) => post.title));
  });
});
