import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import { EquivalenceRequest, verifyStrategyEquivalence } from "./equivalence";

type FeedBody = {
  posts: Record<string, unknown>[];
  pagination: Record<string, number>;
  isPersonalized: boolean;
};

const body = (ids: number[], overrides: Partial<FeedBody> = {}): FeedBody => ({
  posts: ids.map((id) => ({ id, title: `Post ${id}`, is_liked: false })),
  pagination: { currentPage: 1, totalPages: 1, totalPosts: ids.length, postsPerPage: 12 },
  isPersonalized: true,
  ...overrides,
});

async function startTarget(
  respond: (strategy: string, req: IncomingMessage) => { status?: number; body: unknown; echo?: string },
): Promise<{ server: Server; url: string }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const strategy = String(req.headers["x-benchmark-feed-strategy"]);
    const reply = respond(strategy, req);
    res.writeHead(reply.status ?? 200, {
      "Content-Type": "application/json",
      "x-benchmark-feed-strategy": reply.echo ?? strategy,
    });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

const requests: EquivalenceRequest[] = [
  {
    name: "returning user home page 1",
    request: { requestClass: "home-personalized", query: { page: "1", limit: "12" }, sessionId: "s1" },
    expectPersonalized: true,
  },
];

describe("feed strategy equivalence", () => {
  let target: { server: Server; url: string } | undefined;

  afterEach(async () => {
    await new Promise((resolve) => target?.server.close(resolve));
    target = undefined;
  });

  const verify = (targetUrl: string, fixed = requests) =>
    verifyStrategyEquivalence({ targetUrl, requests: fixed, sessionCookieName: "session-id" });

  it("accepts identical business results from both strategies", async () => {
    target = await startTarget(() => ({ body: body([3, 1, 2]) }));

    expect(await verify(target.url)).toEqual([
      {
        name: "returning user home page 1",
        requestClass: "home-personalized",
        ok: true,
        postIds: [3, 1, 2],
      },
    ]);
  });

  it("sends the fixed request's query and session to both strategies", async () => {
    const seen: string[] = [];
    target = await startTarget((strategy, req) => {
      seen.push(`${strategy} ${req.url} ${req.headers.cookie}`);
      return { body: body([1]) };
    });

    await verify(target.url);

    expect(seen).toEqual([
      "full-hydration /api/posts/feed?page=1&limit=12 session-id=s1",
      "late-materialization /api/posts/feed?page=1&limit=12 session-id=s1",
    ]);
  });

  it.each([
    [
      "a different post order",
      () => body([1, 3, 2]),
      "post order differs: baseline [3,1,2], current [1,3,2]",
    ],
    [
      "a different hydrated field",
      () => body([3, 1, 2], { posts: [{ id: 3, title: "Changed", is_liked: false }, { id: 1 }, { id: 2 }] }),
      'post 3 field title differs: baseline "Post 3", current "Changed"',
    ],
    [
      "different pagination",
      () => body([3, 1, 2], { pagination: { currentPage: 1, totalPages: 2, totalPosts: 20, postsPerPage: 12 } }),
      "pagination differs",
    ],
  ])("rejects %s", async (_label, currentBody, detail) => {
    target = await startTarget((strategy) => ({
      body: strategy === "full-hydration" ? body([3, 1, 2]) : currentBody(),
    }));

    const [check] = await verify(target.url);

    expect(check.ok).toBe(false);
    expect(check.detail).toContain(detail);
  });

  it("reports the first differing field of an otherwise identical post", async () => {
    target = await startTarget((strategy) => ({
      body: body([3], {
        posts: [{ id: 3, title: "Post 3", is_liked: strategy === "late-materialization" }],
      }),
    }));

    const [check] = await verify(target.url);

    expect(check).toMatchObject({ ok: false, detail: "post 3 field is_liked differs: baseline false, current true" });
  });

  it("rejects a target that does not apply the requested strategy", async () => {
    target = await startTarget(() => ({ body: body([1]), echo: "late-materialization" }));

    const [check] = await verify(target.url);

    expect(check).toMatchObject({ ok: false, detail: expect.stringContaining("did not apply full-hydration") });
  });

  it("rejects empty or unpersonalized results that cannot demonstrate equivalence", async () => {
    target = await startTarget(() => ({ body: body([], { isPersonalized: false }) }));

    const [check] = await verify(target.url);

    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/no posts|not personalized/);
  });

  it("rejects non-2xx responses", async () => {
    target = await startTarget(() => ({ status: 500, body: { errorMessage: "Internal server error" } }));

    const [check] = await verify(target.url);

    expect(check).toMatchObject({ ok: false, detail: expect.stringContaining("HTTP 500") });
  });
});
