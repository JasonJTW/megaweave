// server/src/benchmark/feed/equivalence.ts
// 效能比較前的前提：同一組固定請求在 baseline 與現行策略下必須回傳相同的業務結果，
// 否則延遲差異可能來自回傳內容不同，而非 hydration 策略。

import { isDeepStrictEqual } from "util";
import { FEED_STRATEGY_HEADER, FeedStrategy } from "../feedStrategy";
import { buildFeedHeaders, buildFeedUrl, REQUEST_TIMEOUT_MS } from "./load";
import type { FeedRequest } from "./workload";

export interface EquivalenceRequest {
  name: string;
  request: FeedRequest;
  /** 回訪使用者的請求必須走個人化路徑，確保比較涵蓋向量重排 */
  expectPersonalized?: boolean;
}

export interface EquivalenceCheck {
  name: string;
  requestClass: string;
  ok: boolean;
  detail?: string;
  postIds: number[];
}

interface FeedBody {
  posts?: Record<string, unknown>[];
  pagination?: unknown;
  isPersonalized?: unknown;
}

interface StrategyResponse {
  status: number;
  appliedStrategy: string | null;
  body: FeedBody;
}

async function fetchWithStrategy(
  targetUrl: string,
  request: FeedRequest,
  strategy: FeedStrategy,
  sessionCookieName: string,
): Promise<StrategyResponse> {
  const response = await fetch(buildFeedUrl(targetUrl, request), {
    headers: buildFeedHeaders(request, strategy, sessionCookieName),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: FeedBody = {};
  try {
    body = JSON.parse(text) as FeedBody;
  } catch {
    // 非 JSON 回應以空 body 處理，下方會因狀態碼或缺少貼文而判定失敗
  }
  return {
    status: response.status,
    appliedStrategy: response.headers.get(FEED_STRATEGY_HEADER),
    body,
  };
}

const postIdsOf = (body: FeedBody) => (body.posts ?? []).map((post) => Number(post.id));

function findDifference(baseline: FeedBody, current: FeedBody): string | null {
  const baselineIds = postIdsOf(baseline);
  const currentIds = postIdsOf(current);
  if (!isDeepStrictEqual(baselineIds, currentIds)) {
    return `post order differs: baseline ${JSON.stringify(baselineIds)}, current ${JSON.stringify(currentIds)}`;
  }
  if (!isDeepStrictEqual(baseline.pagination, current.pagination)) {
    return `pagination differs: baseline ${JSON.stringify(baseline.pagination)}, current ${JSON.stringify(current.pagination)}`;
  }
  if (baseline.isPersonalized !== current.isPersonalized) {
    return `isPersonalized differs: baseline ${String(baseline.isPersonalized)}, current ${String(current.isPersonalized)}`;
  }
  const baselinePosts = baseline.posts ?? [];
  const currentPosts = current.posts ?? [];
  for (let i = 0; i < baselinePosts.length; i++) {
    const fields = new Set([...Object.keys(baselinePosts[i]), ...Object.keys(currentPosts[i])]);
    for (const field of fields) {
      if (!isDeepStrictEqual(baselinePosts[i][field], currentPosts[i][field])) {
        return `post ${baselineIds[i]} field ${field} differs: baseline ${JSON.stringify(baselinePosts[i][field])}, current ${JSON.stringify(currentPosts[i][field])}`;
      }
    }
  }
  return null;
}

function checkResponses(
  fixed: EquivalenceRequest,
  baseline: StrategyResponse,
  current: StrategyResponse,
): string | null {
  for (const [strategy, response] of [
    ["full-hydration", baseline],
    ["late-materialization", current],
  ] as const satisfies readonly (readonly [FeedStrategy, StrategyResponse])[]) {
    if (response.status < 200 || response.status >= 300) {
      return `${strategy} returned HTTP ${response.status}`;
    }
    if (response.appliedStrategy !== strategy) {
      return `target did not apply ${strategy} (applied ${response.appliedStrategy ?? "none"})`;
    }
  }
  const difference = findDifference(baseline.body, current.body);
  if (difference) return difference;
  if (postIdsOf(current.body).length === 0) {
    return "no posts returned, so equivalence cannot be demonstrated";
  }
  if (fixed.expectPersonalized && current.body.isPersonalized !== true) {
    return "result is not personalized; the session or user vector is not visible to the target";
  }
  return null;
}

export async function verifyStrategyEquivalence(options: {
  targetUrl: string;
  requests: readonly EquivalenceRequest[];
  sessionCookieName: string;
}): Promise<EquivalenceCheck[]> {
  const checks: EquivalenceCheck[] = [];
  for (const fixed of options.requests) {
    // 依序送出，避免兩種策略互相影響彼此的延遲或快取狀態
    const baseline = await fetchWithStrategy(options.targetUrl, fixed.request, "full-hydration", options.sessionCookieName);
    const current = await fetchWithStrategy(options.targetUrl, fixed.request, "late-materialization", options.sessionCookieName);
    const detail = checkResponses(fixed, baseline, current);
    checks.push({
      name: fixed.name,
      requestClass: fixed.request.requestClass,
      ok: detail === null,
      ...(detail ? { detail } : {}),
      postIds: postIdsOf(current.body),
    });
  }
  return checks;
}
