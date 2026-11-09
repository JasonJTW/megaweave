import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RETRIES,
  imageRetryReducer,
  initialImageRetry,
  isWaitingToRetry,
  retryDelayMs,
  type ImageRetryEvent,
  type ImageRetryState,
} from "@/utils/imageRetry";

const thumb = "https://cdn.test/thumbnails/posts/medium/a.webp";
const original = "https://cdn.test/posts/a.webp";

function run(
  events: ImageRetryEvent["type"][],
  fallback: string | null = original,
) {
  return events.reduce<ImageRetryState>(
    (state, type) => imageRetryReducer(state, { type } as ImageRetryEvent),
    initialImageRetry(thumb, fallback ?? undefined),
  );
}

/** Every thumbnail attempt fails: the first load plus MAX_RETRIES retries */
const thumbnailNeverExists: ImageRetryEvent["type"][] = [
  "error",
  ...Array.from(
    { length: MAX_RETRIES },
    () => ["retry", "error"] as const,
  ).flat(),
];

describe("imageRetry", () => {
  it("shows the thumbnail without the shimmer when it loads", () => {
    const state = run(["load"]);
    assert.equal(state.src, thumb);
    assert.equal(state.status, "idle");
  });

  it("retries a missing thumbnail with a new URL after 2s, 4s, 8s and 16s", () => {
    let state = initialImageRetry(thumb, original);
    const delays: number[] = [];
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      state = imageRetryReducer(state, { type: "error" });
      assert.equal(state.status, "retrying");
      assert.ok(isWaitingToRetry(state));
      delays.push(retryDelayMs(state));
      state = imageRetryReducer(state, { type: "retry" });
      assert.equal(state.src, `${thumb}?retry=${attempt}`);
      assert.equal(state.status, "idle");
    }
    assert.deepEqual(delays, [2000, 4000, 8000, 16000]);
  });

  it("falls back to the original once the retries run out", () => {
    const state = run(thumbnailNeverExists);
    assert.equal(state.src, original);
    assert.equal(state.status, "retrying");
    assert.equal(isWaitingToRetry(state), false);
  });

  it("stops the shimmer once the original loads", () => {
    const state = run([...thumbnailNeverExists, "load"]);
    assert.equal(state.src, original);
    assert.equal(state.status, "idle");
  });

  it("shows the placeholder when the original fails too", () => {
    assert.equal(run([...thumbnailNeverExists, "error"]).status, "failed");
  });

  it("shows the placeholder when the retries run out and there is no original", () => {
    assert.equal(run(thumbnailNeverExists, null).status, "failed");
  });

  it("starts over when the post's image changes", () => {
    const state = imageRetryReducer(run(thumbnailNeverExists), {
      type: "reset",
      primarySrc: "https://cdn.test/thumbnails/posts/medium/b.webp",
      fallbackSrc: "https://cdn.test/posts/b.webp",
    });
    assert.deepEqual(
      state,
      initialImageRetry(
        "https://cdn.test/thumbnails/posts/medium/b.webp",
        "https://cdn.test/posts/b.webp",
      ),
    );
  });
});
