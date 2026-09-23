import { createServer, IncomingMessage, Server } from "http";
import { AddressInfo } from "net";
import { readBody } from "../mocks/mockHttp";
import { runTraffic } from "./traffic";

interface Recorded {
  method: string;
  path: string;
  cookie?: string;
  body: string;
}

async function startTarget(): Promise<{ server: Server; url: string; requests: Recorded[] }> {
  const requests: Recorded[] = [];
  let nextPostId = 500;
  const server = createServer(async (req: IncomingMessage, res) => {
    const body = (await readBody(req)).toString();
    const url = new URL(req.url!, "http://target");
    requests.push({ method: req.method!, path: url.pathname, cookie: req.headers.cookie, body });
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/api/posts/feed") {
      res.end(JSON.stringify({ posts: [] }));
    } else if (url.pathname === "/api/posts/presigned-urls" && req.headers.cookie === "session-id=expired") {
      res.statusCode = 401;
      res.end(JSON.stringify({ errorMessage: "Unauthorized" }));
    } else if (url.pathname === "/api/posts/presigned-urls") {
      const { files } = JSON.parse(body) as { files: unknown[] };
      const { port } = server.address() as AddressInfo;
      res.end(
        JSON.stringify({
          urls: files.map((_, i) => ({
            stagingKey: `staging/posts/${nextPostId}-${i}.jpg`,
            presignedUrl: `http://127.0.0.1:${port}/staging-bucket/staging/posts/${nextPostId}-${i}.jpg?X-Amz-Signature=x`,
          })),
        }),
      );
    } else if (url.pathname.startsWith("/staging-bucket/")) {
      res.end();
    } else if (url.pathname === "/api/posts" && req.method === "POST") {
      res.statusCode = 201;
      res.end(JSON.stringify({ post: { id: nextPostId++ } }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, requests };
}

describe("queue burst user traffic", () => {
  let target: Awaited<ReturnType<typeof startTarget>>;

  beforeEach(async () => {
    target = await startTarget();
  });

  afterEach(async () => {
    await new Promise((resolve) => target.server.close(resolve));
  });

  it("keeps feed and post-creation users running through the public API until stopped", async () => {
    const stop = new AbortController();
    const running = runTraffic({
      targetUrl: target.url,
      sessionCookieName: "session-id",
      catalog: { categoryIds: [1, 2] },
      feedUsers: [
        { persona: { kind: "anonymous" }, seed: 1 },
        { persona: { kind: "returning", sessionId: "returning-session", coordinates: { lat: 25, lng: 121.5 } }, seed: 2 },
      ],
      posters: [
        {
          sessionId: "poster-session",
          seed: 3,
          location: { place_id: "benchmark-place-00001", full_address: "106臺北市大安區示範路1段1號", province: "臺北市", city: "大安區", lat: 25, lng: 121.5 },
        },
      ],
      feedThinkTimeMs: { min: 5, max: 10 },
      postThinkTimeMs: { min: 5, max: 10 },
      imageCountWeights: [[2, 1]],
      images: [[{ buffer: Buffer.from("jpeg-bytes"), contentType: "image/jpeg", extension: "jpg" }, 1]],
      signal: stop.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    stop.abort();
    const result = await running;

    const feed = result.samples.filter((s) => s.group === "feed");
    const posts = result.samples.filter((s) => s.group === "post-creation");
    expect(feed.length).toBeGreaterThan(4);
    expect(feed.every((s) => s.status === 200)).toBe(true);
    expect(posts.map((s) => s.requestClass)).toEqual(expect.arrayContaining(["post-presign", "post-create"]));
    expect(posts.every((s) => s.status === 200 || s.status === 201)).toBe(true);

    expect(result.createdPosts.length).toBeGreaterThan(0);
    expect(result.createdPosts[0]).toEqual({ postId: 500, stagingKeys: ["staging/posts/500-0.jpg", "staging/posts/500-1.jpg"] });

    const creates = target.requests.filter((r) => r.path === "/api/posts");
    const payload = JSON.parse(creates[0].body);
    expect(creates[0].cookie).toBe("session-id=poster-session");
    expect(payload).toMatchObject({
      stagingKeys: ["staging/posts/500-0.jpg", "staging/posts/500-1.jpg"],
      place_id: "benchmark-place-00001",
      lat: 25,
    });
    expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const uploads = target.requests.filter((r) => r.method === "PUT");
    expect(uploads[0].body).toBe("jpeg-bytes");
    expect(target.requests.some((r) => r.path === "/api/posts/feed" && r.cookie === "session-id=returning-session")).toBe(true);
  });

  it("uploads each image from the weighted mix with a matching presign content type", async () => {
    const stop = new AbortController();
    const running = runTraffic({
      targetUrl: target.url,
      sessionCookieName: "session-id",
      catalog: { categoryIds: [1] },
      feedUsers: [],
      posters: [{ sessionId: "poster-session", seed: 4 }],
      feedThinkTimeMs: { min: 5, max: 10 },
      postThinkTimeMs: { min: 5, max: 10 },
      imageCountWeights: [[3, 1]],
      images: [
        [{ buffer: Buffer.from("webp-bytes"), contentType: "image/webp", extension: "webp" }, 1],
        [{ buffer: Buffer.from("jpeg-bytes"), contentType: "image/jpeg", extension: "jpg" }, 1],
      ],
      signal: stop.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    stop.abort();
    await running;

    const requestedTypes = target.requests
      .filter((r) => r.path === "/api/posts/presigned-urls")
      .flatMap((r) => (JSON.parse(r.body).files as { filename: string; contentType: string }[]));
    for (const file of requestedTypes) {
      expect(file.filename.endsWith(file.contentType === "image/webp" ? ".webp" : ".jpg")).toBe(true);
    }
    const uploaded = target.requests.filter((r) => r.method === "PUT").map((r) => r.body);
    expect(new Set(uploaded)).toEqual(new Set(["webp-bytes", "jpeg-bytes"]));
    expect(uploaded).toEqual(
      requestedTypes.slice(0, uploaded.length).map((file) => (file.contentType === "image/webp" ? "webp-bytes" : "jpeg-bytes")),
    );
  });

  it("records failed post creation steps as errors instead of throwing", async () => {
    const stop = new AbortController();
    const running = runTraffic({
      targetUrl: target.url,
      sessionCookieName: "session-id",
      catalog: { categoryIds: [1] },
      feedUsers: [],
      posters: [{ sessionId: "expired", seed: 3 }],
      feedThinkTimeMs: { min: 5, max: 10 },
      postThinkTimeMs: { min: 5, max: 10 },
      imageCountWeights: [[1, 1]],
      images: [[{ buffer: Buffer.from("x"), contentType: "image/jpeg", extension: "jpg" }, 1]],
      signal: stop.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop.abort();
    const result = await running;

    expect(result.samples.length).toBeGreaterThan(0);
    expect(result.samples.every((s) => s.requestClass === "post-presign" && s.status === 401)).toBe(true);
    expect(result.createdPosts).toEqual([]);
  });

  it("uses deterministic post content for the same seed", async () => {
    const payloads: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const stop = new AbortController();
      const before = target.requests.length;
      const running = runTraffic({
        targetUrl: target.url,
        sessionCookieName: "session-id",
        catalog: { categoryIds: [1] },
        feedUsers: [],
        posters: [{ sessionId: "s", seed: 9 }],
        feedThinkTimeMs: { min: 1, max: 1 },
        postThinkTimeMs: { min: 5, max: 10 },
        imageCountWeights: [[1, 1]],
        images: [[{ buffer: Buffer.from("x"), contentType: "image/jpeg", extension: "jpg" }, 1]],
        signal: stop.signal,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      stop.abort();
      await running;
      payloads.push(
        target.requests
          .slice(before)
          .filter((r) => r.path === "/api/posts")
          .map((r) => {
            const { title, content } = JSON.parse(r.body);
            return `${title}|${content}`;
          })
          .slice(0, 2),
      );
    }
    expect(payloads[0]).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
  });
});
