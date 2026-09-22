import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import { createRandom } from "../fixture/random";
import { runLoad, VirtualUser } from "./load";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function startTarget(handler: Handler): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

function virtualUsers(count: number, sessionId?: string): VirtualUser[] {
  return Array.from({ length: count }, (_, index) => ({
    nextRequest: () => ({
      requestClass: "home-personalized",
      query: { page: "1", limit: "12" },
      ...(sessionId ? { sessionId } : {}),
    }),
    random: createRandom(index + 1),
  }));
}

const echoStrategy: Handler = (req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "x-benchmark-feed-strategy": String(req.headers["x-benchmark-feed-strategy"]),
  });
  res.end(JSON.stringify({ posts: [1, 2, 3] }));
};

describe("feed load generator", () => {
  let target: { server: Server; url: string } | undefined;

  afterEach(async () => {
    await new Promise((resolve) => target?.server.close(resolve));
    target = undefined;
  });

  it("drives every virtual user through the public feed endpoint with its session and strategy", async () => {
    const seen: IncomingMessage[] = [];
    target = await startTarget((req, res) => {
      seen.push(req);
      echoStrategy(req, res);
    });

    const result = await runLoad({
      targetUrl: target.url,
      strategy: "full-hydration",
      virtualUsers: virtualUsers(3, "abc"),
      durationMs: 300,
      thinkTimeMs: { min: 10, max: 20 },
      sessionCookieName: "session-id",
    });

    expect(result.samples.length).toBeGreaterThanOrEqual(6);
    expect(result.samples.every((s) => s.status === 200 && s.bytes === 17)).toBe(true);
    expect(result.strategyMismatches).toBe(0);
    expect(seen[0].url).toBe("/api/posts/feed?page=1&limit=12");
    expect(seen[0].headers.cookie).toBe("session-id=abc");
    expect(seen[0].headers["x-benchmark-feed-strategy"]).toBe("full-hydration");
  });

  it("waits a think time between each user's requests", async () => {
    target = await startTarget(echoStrategy);

    const result = await runLoad({
      targetUrl: target.url,
      strategy: "late-materialization",
      virtualUsers: virtualUsers(1),
      durationMs: 400,
      thinkTimeMs: { min: 100, max: 100 },
      sessionCookieName: "session-id",
    });

    // 啟動延遲介於 0–100ms，之後每 ~100ms 一次請求
    expect(result.samples.length).toBeGreaterThanOrEqual(3);
    expect(result.samples.length).toBeLessThanOrEqual(5);
  });

  it("does not start requests after the measurement window closes", async () => {
    const startedAt: number[] = [];
    target = await startTarget((req, res) => {
      startedAt.push(Date.now());
      setTimeout(() => echoStrategy(req, res), 150);
    });
    const started = Date.now();

    const result = await runLoad({
      targetUrl: target.url,
      strategy: "late-materialization",
      virtualUsers: virtualUsers(2),
      durationMs: 200,
      thinkTimeMs: { min: 10, max: 10 },
      sessionCookieName: "session-id",
    });

    expect(startedAt.every((time) => time - started < 250)).toBe(true);
    // 視窗內開始的請求仍會等待完成並計入
    expect(result.samples).toHaveLength(startedAt.length);
    expect(result.samples.every((s) => s.latencyMs >= 140)).toBe(true);
  });

  it("records HTTP errors, network failures, and targets that ignore the requested strategy", async () => {
    let requests = 0;
    target = await startTarget((req, res) => {
      requests++;
      if (requests === 1) {
        res.writeHead(500, { "x-benchmark-feed-strategy": "full-hydration" });
        res.end("{}");
      } else if (requests === 2) {
        req.socket.destroy();
      } else {
        res.writeHead(200, { "x-benchmark-feed-strategy": "late-materialization" });
        res.end("{}");
      }
    });

    const result = await runLoad({
      targetUrl: target.url,
      strategy: "full-hydration",
      virtualUsers: virtualUsers(1),
      durationMs: 300,
      thinkTimeMs: { min: 5, max: 5 },
      sessionCookieName: "session-id",
    });

    expect(result.samples[0]).toMatchObject({ status: 500 });
    expect(result.samples[1]).toMatchObject({ status: 0, error: expect.any(String) });
    // 回應了不同策略的請求不能當作 baseline 樣本
    expect(result.strategyMismatches).toBe(result.samples.length - 2);
    expect(result.strategyMismatches).toBeGreaterThan(0);
  });
});
