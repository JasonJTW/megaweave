// server/src/benchmark/feed/load.ts
// Closed-loop 負載產生器：每個虛擬使用者發出請求、讀完整個回應後等待一段 think time 再發下一個，
// 模擬真人瀏覽而非固定速率壓測。所有請求都走公開的 HTTP feed endpoint。

import { FEED_STRATEGY_HEADER, FeedStrategy } from "../feedStrategy";
import type { Random } from "../fixture/random";
import type { RequestSample } from "./stats";
import type { FeedRequest } from "./workload";

export const FEED_PATH = "/api/posts/feed";
export const REQUEST_TIMEOUT_MS = 30_000;

export interface VirtualUser {
  nextRequest: () => FeedRequest;
  /** think time 與啟動延遲使用的亂數；與請求序列分開，確保兩種策略的請求序列相同 */
  random: Random;
}

export interface LoadOptions {
  targetUrl: string;
  strategy: FeedStrategy;
  virtualUsers: readonly VirtualUser[];
  durationMs: number;
  thinkTimeMs: { min: number; max: number };
  sessionCookieName: string;
  requestTimeoutMs?: number;
}

export interface LoadResult {
  samples: RequestSample[];
  /** 目標回應的策略與要求不同的請求數；非 0 代表結果不能當作該策略的量測 */
  strategyMismatches: number;
}

export function buildFeedUrl(targetUrl: string, request: FeedRequest): string {
  const url = new URL(FEED_PATH, targetUrl);
  url.search = new URLSearchParams(request.query).toString();
  return url.toString();
}

export function buildFeedHeaders(
  request: FeedRequest,
  strategy: FeedStrategy,
  sessionCookieName: string,
): Record<string, string> {
  return {
    [FEED_STRATEGY_HEADER]: strategy,
    ...(request.sessionId ? { cookie: `${sessionCookieName}=${request.sessionId}` } : {}),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runLoad(options: LoadOptions): Promise<LoadResult> {
  const samples: RequestSample[] = [];
  let strategyMismatches = 0;
  const endAt = performance.now() + options.durationMs;
  const { min, max } = options.thinkTimeMs;
  const thinkTime = (random: Random) => min + random.next() * (max - min);

  const send = async (request: FeedRequest): Promise<void> => {
    const started = performance.now();
    try {
      const response = await fetch(buildFeedUrl(options.targetUrl, request), {
        headers: buildFeedHeaders(request, options.strategy, options.sessionCookieName),
        signal: AbortSignal.timeout(options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS),
      });
      const body = await response.arrayBuffer();
      const latencyMs = Math.round((performance.now() - started) * 10) / 10;
      if (response.headers.get(FEED_STRATEGY_HEADER) !== options.strategy) strategyMismatches++;
      samples.push({
        requestClass: request.requestClass,
        latencyMs,
        status: response.status,
        bytes: body.byteLength,
      });
    } catch (error) {
      samples.push({
        requestClass: request.requestClass,
        latencyMs: Math.round((performance.now() - started) * 10) / 10,
        status: 0,
        bytes: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const runVirtualUser = async (user: VirtualUser): Promise<void> => {
    // 錯開啟動時間，避免所有使用者在同一瞬間送出第一個請求
    await sleep(user.random.next() * max);
    while (performance.now() < endAt) {
      await send(user.nextRequest());
      const pause = thinkTime(user.random);
      if (performance.now() + pause >= endAt) break;
      await sleep(pause);
    }
  };

  await Promise.all(options.virtualUsers.map(runVirtualUser));
  return { samples, strategyMismatches };
}
