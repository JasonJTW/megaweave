import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL, AUTH_FILE } from "./fixtures/auth";

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
  // One worker, one sign-in: the auth rate limiter (10/min per IP) is shared with the
  // UI sign-in specs, and a per-worker beforeAll would exhaust it
  test.describe.configure({ mode: "serial" });

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

interface OwnPost {
  id: number;
  public_id: string;
  title: string;
}

// ADR 0003: 能認領 = 能看到; anyone outside the tier gets 404 (never 403) on every
// single-post path, so the response never confirms the item exists.
test.describe("Org posts below Public return 404 to viewers outside the tier", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "API-only spec",
  );
  // Same reason as above: one worker, one sign-in for the org viewer
  test.describe.configure({ mode: "serial" });

  let guest: APIRequestContext;
  // Signed in (session saved by auth.setup.ts) but without any org membership
  let outsider: APIRequestContext;
  let member: APIRequestContext;
  const posts: Record<keyof typeof FIXTURE, OwnPost> = {} as never;

  test.beforeAll(async () => {
    guest = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
    outsider = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
      storageState: AUTH_FILE,
    });
    member = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
    const signin = await member.post(`${API_URL}/api/signin`, { data: viewer });
    expect(signin.ok(), await signin.text()).toBeTruthy();

    // The viewer is the poster of every fixture post, so its own stats list them
    const stats = await member.get(`${API_URL}/api/user/stats`);
    expect(stats.ok(), await stats.text()).toBeTruthy();
    const own = ((await stats.json()) as { posts: OwnPost[] }).posts;
    for (const key of Object.keys(FIXTURE) as Array<keyof typeof FIXTURE>) {
      const post = own.find((p) => p.title === FIXTURE[key]);
      expect(post, `fixture post ${key}`).toBeTruthy();
      posts[key] = post!;
    }
  });

  test.afterAll(async () => {
    await guest?.dispose();
    await outsider?.dispose();
    await member?.dispose();
  });

  async function expectNotFound(
    response: Awaited<ReturnType<APIRequestContext["get"]>>,
    what: string,
  ): Promise<void> {
    expect(response.status(), `${what}: ${await response.text()}`).toBe(404);
    expect(((await response.json()) as { code: string }).code).toBe(
      "POST_NOT_FOUND",
    );
  }

  for (const tier of ["internal", "members"] as const) {
    test(`${tier}: detail is 404 for guests and outsiders, 200 for the member`, async () => {
      const path = `${API_URL}/api/posts/${posts[tier].public_id}`;
      await expectNotFound(await guest.get(path), "guest detail");
      await expectNotFound(await outsider.get(path), "outsider detail");
      const own = await member.get(path);
      expect(own.status(), await own.text()).toBe(200);
    });

    test(`${tier}: comments are 404 for outsiders`, async () => {
      const { id } = posts[tier];
      await expectNotFound(
        await guest.get(`${API_URL}/api/comments?post_id=${id}`),
        "comment list",
      );
      await expectNotFound(
        await guest.get(`${API_URL}/api/comments/counts?post_id=${id}`),
        "comment counts",
      );
      await expectNotFound(
        await outsider.post(`${API_URL}/api/comments`, {
          data: { post_id: id, content: "hello" },
        }),
        "new comment",
      );
      const list = await member.get(`${API_URL}/api/comments?post_id=${id}`);
      expect(list.status(), await list.text()).toBe(200);
    });

    test(`${tier}: likes are 404 for outsiders`, async () => {
      const path = `${API_URL}/api/posts/${posts[tier].public_id}/like`;
      await expectNotFound(await outsider.get(path), "like status");
      await expectNotFound(
        await outsider.put(path, { data: { liked: true } }),
        "like",
      );
      await expectNotFound(await outsider.post(path), "legacy like toggle");
      const status = await member.get(path);
      expect(status.status(), await status.text()).toBe(200);
    });

    test(`${tier}: Weave requests are 404 for outsiders`, async () => {
      await expectNotFound(
        await outsider.post(`${API_URL}/api/weaves`, {
          data: { postId: posts[tier].id },
        }),
        "weave request",
      );
    });

    test(`${tier}: a DM cannot carry the post's info for outsiders`, async () => {
      const own = await member.get(
        `${API_URL}/api/posts/${posts[tier].public_id}`,
      );
      expect(own.ok(), await own.text()).toBeTruthy();
      const { post } = (await own.json()) as {
        post: { author_public_id: string };
      };
      await expectNotFound(
        await outsider.post(`${API_URL}/api/messages`, {
          multipart: {
            recipient_public_id: post.author_public_id,
            content: "is this still available?",
            item_id: "1",
            item_title: "anything",
            post_id: String(posts[tier].id),
          },
        }),
        "DM with post info",
      );
    });

    test(`${tier}: the item page has no OG content and is noindex`, async ({
      baseURL,
    }) => {
      const page = await guest.get(`${baseURL}/item/${posts[tier].public_id}`);
      const html = await page.text();
      expect(html).toMatch(/<meta name="robots" content="noindex/);
      expect(html).not.toContain("og:image");
      expect(html).not.toContain(FIXTURE[tier]);
      const og = await guest.get(
        `${baseURL}/api/og?id=${posts[tier].public_id}`,
      );
      expect(og.status()).toBe(404);
    });
  }

  for (const key of ["public", "personal"] as const) {
    test(`${key}: detail, comments and the item page behave as before`, async ({
      baseURL,
    }) => {
      const detail = await guest.get(
        `${API_URL}/api/posts/${posts[key].public_id}`,
      );
      expect(detail.status(), await detail.text()).toBe(200);
      const comments = await guest.get(
        `${API_URL}/api/comments?post_id=${posts[key].id}`,
      );
      expect(comments.status(), await comments.text()).toBe(200);
      const html = await (
        await guest.get(`${baseURL}/item/${posts[key].public_id}`)
      ).text();
      expect(html).toContain("og:image");
      expect(html).not.toMatch(/<meta name="robots" content="noindex/);
    });
  }
});
