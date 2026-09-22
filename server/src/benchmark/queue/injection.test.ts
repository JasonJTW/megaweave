import type { BurstUnit } from "./burstPlan";
import { BurstEnqueue, BurstPost, injectBurst } from "./injection";

const unit = (index: number, userId = 10 + index): BurstUnit => ({
  index,
  post: {
    title: `title ${index}`,
    content: `content ${index}`,
    type: "share",
    categoryId: 2,
    conditionLevel: 3,
    tags: "tag",
    items: [{ title: "item", quantity: 1 }],
    userId,
    location: index === 0 ? { id: 1, province: "Taipei", city: "Da'an" } : null,
  },
  images: 2,
  interaction: { userId, postId: 500 + index, action: "like" },
});

const post = (index: number): BurstPost => ({
  unit: unit(index),
  postId: 100 + index,
  stagingKeys: [`staging/${index}-1.jpg`, `staging/${index}-2.jpg`],
  s3Keys: [`posts/${index}-1.webp`, `posts/${index}-2.webp`],
});

function fakeQueues(options: { deduplicateUserVectorFor?: number[] } = {}) {
  const calls: { queue: string; data: unknown }[] = [];
  let nextId = 1;
  const add = (queue: string) => async (data: unknown) => {
    calls.push({ queue, data });
    return { id: String(nextId++) };
  };
  const enqueue: BurstEnqueue = {
    postImages: add("post-image"),
    postEmbedding: add("post-embedding"),
    userVector: async (data) => (options.deduplicateUserVectorFor?.includes(data.userId) ? null : add("user-vector")(data)),
  };
  return { enqueue, calls };
}

function fakeClock() {
  let nowMs = 1_000;
  const waits: number[] = [];
  return {
    now: () => nowMs,
    sleep: async (ms: number) => {
      waits.push(ms);
      nowMs += ms;
    },
    waits,
  };
}

describe("burst injection", () => {
  it("enqueues each unit's image, embedding, and user-vector work with the production payloads", async () => {
    const { enqueue, calls } = fakeQueues();
    const clock = fakeClock();

    await injectBurst({ posts: [post(0)], injectionMs: 1_000, enqueue, ...clock });

    expect(calls).toEqual([
      {
        queue: "post-image",
        data: {
          postId: 100,
          files: [
            { s3Key: "posts/0-1.webp", stagingKey: "staging/0-1.jpg" },
            { s3Key: "posts/0-2.webp", stagingKey: "staging/0-2.jpg" },
          ],
        },
      },
      {
        queue: "post-embedding",
        data: {
          postId: 100,
          post: {
            title: "title 0",
            content: "content 0",
            type: "share",
            categoryId: 2,
            conditionLevel: 3,
            tags: "tag",
            items: [{ title: "item", quantity: 1 }],
            city: "Da'an",
            province: "Taipei",
          },
        },
      },
      { queue: "user-vector", data: { userId: 10, postId: 500, action: "like" } },
    ]);
  });

  it("spreads units evenly over the injection window and reports when it started and ended", async () => {
    const { enqueue } = fakeQueues();
    const clock = fakeClock();

    const result = await injectBurst({ posts: [post(0), post(1), post(2), post(3)], injectionMs: 2_000, enqueue, ...clock });

    expect(clock.waits).toEqual([500, 500, 500]);
    expect(result.startedAtMs).toBe(1_000);
    expect(result.endedAtMs).toBe(2_500);
  });

  it("records every submitted job by queue and unit, and counts user-vector work the producer deduplicated", async () => {
    const { enqueue } = fakeQueues({ deduplicateUserVectorFor: [11] });
    const clock = fakeClock();

    const result = await injectBurst({ posts: [post(0), post(1)], injectionMs: 0, enqueue, ...clock });

    expect(result.submitted).toEqual([
      { queue: "post-image", jobId: "1", origin: "burst" },
      { queue: "post-embedding", jobId: "2", origin: "burst" },
      { queue: "user-vector", jobId: "3", origin: "burst" },
      { queue: "post-image", jobId: "4", origin: "burst" },
      { queue: "post-embedding", jobId: "5", origin: "burst" },
    ]);
    expect(result.jobIdsByUnit.get(0)).toEqual({ image: "1", embedding: "2", userVector: "3" });
    expect(result.jobIdsByUnit.get(1)).toEqual({ image: "4", embedding: "5", userVector: undefined });
    expect(result.deduplicated).toBe(1);
  });
});
