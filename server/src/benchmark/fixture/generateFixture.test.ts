import {
  cosineSimilarity,
  EMBEDDING_DIMENSIONS,
  SyntheticEmbeddingModel,
} from "./embeddings";
import {
  DEFAULT_FIXTURE_SEED,
  FixtureDataset,
  generateFixture,
} from "./generateFixture";

const DAY_SECONDS = 24 * 60 * 60;

describe("benchmark fixture generator", () => {
  let fixture10k: FixtureDataset;

  beforeAll(() => {
    fixture10k = generateFixture({ seed: DEFAULT_FIXTURE_SEED, posts: 10_000 });
  });

  describe("determinism", () => {
    it("produces identical data for the same seed", () => {
      const first = generateFixture({ seed: 7, posts: 1_000 });
      const second = generateFixture({ seed: 7, posts: 1_000 });

      expect(second.fingerprint).toBe(first.fingerprint);
      expect(second.posts).toEqual(first.posts);
      expect(second.postLikes).toEqual(first.postLikes);
    });

    it("produces different data for a different seed", () => {
      const first = generateFixture({ seed: 7, posts: 1_000 });
      const second = generateFixture({ seed: 8, posts: 1_000 });

      expect(second.fingerprint).not.toBe(first.fingerprint);
    });

    it("keeps the default 10k fixture stable across machines and commits", () => {
      // 若刻意修改產生規則，必須同時調升 FIXTURE_GENERATOR_VERSION 並更新此值，
      // 否則不同 commit 的 benchmark 結果會在不同資料上比較
      expect(fixture10k.version).toBe("megaweave-fixture-v1-posts10000-seed20260922");
      expect(fixture10k.fingerprint).toBe(
        "926f66add0b05bc3c61bd92aefdf904aaece0546428ddff23bd48c90731728b0",
      );
    });

    it("rejects fixtures too small to cover every product state", () => {
      expect(() => generateFixture({ seed: 1, posts: 10 })).toThrow("at least 100 posts");
    });
  });

  describe("entity counts", () => {
    it("scales users and locations with the post count", () => {
      expect(fixture10k.counts).toMatchObject({
        posts: 10_000,
        users: 2_000,
        userProfiles: 2_000,
        locations: 400,
        postEmbeddings: 10_000,
      });
    });

    it("reports counts that match the generated rows", () => {
      const { counts, posts } = fixture10k;
      const live = posts.filter((post) => !post.deleted);

      expect(counts.items).toBe(fixture10k.items.length);
      expect(counts.images).toBe(fixture10k.images.length);
      expect(counts.postLikes).toBe(fixture10k.postLikes.length);
      expect(counts.comments).toBe(fixture10k.comments.length);
      expect(counts.weaves).toBe(fixture10k.weaves.length);
      expect(counts.deletedPosts).toBe(posts.length - live.length);
      expect(counts.redisPostVectors).toBe(live.length);
      expect(counts.activePosts).toBe(live.filter((post) => post.status === "active").length);
      expect(counts.trendingPosts).toBe(counts.activePosts);
      expect(counts.userInterestVectors).toBe(
        fixture10k.userProfiles.filter((profile) => profile.has_interest_vector).length,
      );
    });
  });

  describe("relationships", () => {
    it("references only existing users, locations, categories, and conditions", () => {
      const userIds = new Set(fixture10k.users.map((user) => user.id));
      const locationIds = new Set(fixture10k.locations.map((location) => location.id));

      const invalidPosts = fixture10k.posts.filter(
        (post) =>
          !userIds.has(post.user_id) ||
          (post.location_id !== null && !locationIds.has(post.location_id)) ||
          post.category_id < 1 ||
          post.category_id > 10 ||
          post.condition_level < 1 ||
          post.condition_level > 5,
      );

      expect(invalidPosts).toEqual([]);
      expect(fixture10k.userProfiles.filter((profile) => !userIds.has(profile.user_id))).toEqual([]);
    });

    it("attaches items, images, likes, comments, and weaves to existing posts", () => {
      const postIds = new Set(fixture10k.posts.map((post) => post.id));
      const children = [
        ...fixture10k.items,
        ...fixture10k.images,
        ...fixture10k.postLikes,
        ...fixture10k.comments,
        ...fixture10k.weaves,
      ];

      expect(children.every((child) => postIds.has(child.post_id))).toBe(true);
    });

    it("keeps engagement counters consistent with interaction rows", () => {
      const likes = new Map<number, number>();
      const comments = new Map<number, number>();
      const weaves = new Map<number, number>();
      for (const like of fixture10k.postLikes) likes.set(like.post_id, (likes.get(like.post_id) ?? 0) + 1);
      for (const comment of fixture10k.comments) comments.set(comment.post_id, (comments.get(comment.post_id) ?? 0) + 1);
      for (const weave of fixture10k.weaves) weaves.set(weave.post_id, (weaves.get(weave.post_id) ?? 0) + 1);

      const inconsistent = fixture10k.posts.filter(
        (post) =>
          post.likes_count !== (likes.get(post.id) ?? 0) ||
          post.comment_count !== (comments.get(post.id) ?? 0) ||
          post.weave_count !== (weaves.get(post.id) ?? 0),
      );

      expect(inconsistent).toEqual([]);
    });

    it("satisfies database uniqueness and business rules", () => {
      const likeKeys = fixture10k.postLikes.map((like) => `${like.user_id}:${like.post_id}`);
      expect(new Set(likeKeys).size).toBe(likeKeys.length);
      expect(new Set(fixture10k.posts.map((post) => post.public_id)).size).toBe(10_000);
      expect(new Set(fixture10k.users.map((user) => user.email)).size).toBe(2_000);
      expect(new Set(fixture10k.locations.map((location) => location.place_id)).size).toBe(400);

      const postsById = new Map(fixture10k.posts.map((post) => [post.id, post]));
      expect(
        fixture10k.postLikes.filter((like) => like.user_id === postsById.get(like.post_id)!.user_id),
      ).toEqual([]);
      expect(
        fixture10k.weaves.filter((weave) => {
          const post = postsById.get(weave.post_id)!;
          return weave.giver_id !== post.user_id || weave.receiver_id === weave.giver_id || post.type === "wish";
        }),
      ).toEqual([]);
    });

    it("never dates an interaction before its post", () => {
      const postsById = new Map(fixture10k.posts.map((post) => [post.id, post]));
      // offset 越大代表越早；互動不可早於貼文建立
      const earlierThanPost = [...fixture10k.postLikes, ...fixture10k.comments, ...fixture10k.weaves].filter(
        (row) => row.created_offset_s > postsById.get(row.post_id)!.created_offset_s,
      );

      expect(earlierThanPost).toEqual([]);
    });
  });

  describe("representative product states", () => {
    it("covers every post type, status, category, and condition", () => {
      const { posts } = fixture10k;

      expect(new Set(posts.map((post) => post.type))).toEqual(new Set(["share", "wish", "commons"]));
      expect(new Set(posts.map((post) => post.status))).toEqual(new Set(["active", "inactive"]));
      expect(new Set(posts.map((post) => post.category_id)).size).toBe(10);
      expect(new Set(posts.map((post) => post.condition_level)).size).toBe(5);
    });

    it("mixes deleted, expired, unexpired, and never-expiring posts", () => {
      const { posts } = fixture10k;
      const expired = posts.filter(
        (post) => post.expires_after_s !== null && post.created_offset_s > post.expires_after_s,
      );
      const unexpired = posts.filter(
        (post) => post.expires_after_s !== null && post.created_offset_s <= post.expires_after_s,
      );

      expect(posts.filter((post) => post.deleted).length).toBeGreaterThan(0);
      expect(expired.length).toBeGreaterThan(0);
      expect(unexpired.length).toBeGreaterThan(0);
      expect(posts.filter((post) => post.expires_after_s === null).length).toBeGreaterThan(0);
      expect(posts.filter((post) => post.created_offset_s < DAY_SECONDS).length).toBeGreaterThan(0);
      expect(posts.filter((post) => post.created_offset_s > 180 * DAY_SECONDS).length).toBeGreaterThan(0);
    });

    it("varies attachments, locations, and engagement instead of uniform placeholders", () => {
      const { posts } = fixture10k;
      const imagesPerPost = new Map<number, number>();
      for (const image of fixture10k.images) {
        imagesPerPost.set(image.post_id, (imagesPerPost.get(image.post_id) ?? 0) + 1);
      }
      const imageCounts = new Set(posts.map((post) => imagesPerPost.get(post.id) ?? 0));

      expect(imageCounts.size).toBeGreaterThanOrEqual(5);
      expect(posts.some((post) => post.location_id === null)).toBe(true);
      expect(new Set(fixture10k.locations.map((location) => location.province)).size).toBeGreaterThan(5);
      expect(posts.some((post) => post.likes_count === 0)).toBe(true);
      expect(Math.max(...posts.map((post) => post.view_count))).toBeGreaterThan(1_000);
      expect(new Set(posts.map((post) => post.content.length)).size).toBeGreaterThan(50);
    });

    it("includes both personalized and cold-start users", () => {
      const { userProfiles } = fixture10k;
      const withVector = userProfiles.filter((profile) => profile.has_interest_vector).length;

      expect(withVector).toBeGreaterThan(userProfiles.length * 0.5);
      expect(withVector).toBeLessThan(userProfiles.length);
    });

    it("respects the API's post field limits", () => {
      const outOfRange = fixture10k.posts.filter(
        (post) =>
          post.title.length < 5 ||
          post.title.length > 60 ||
          post.content.length < 3 ||
          post.content.length > 1000 ||
          (post.tags ?? "").length > 500,
      );

      expect(outOfRange).toEqual([]);
    });
  });

  describe("privacy", () => {
    it("uses only reserved domains and synthetic identifiers", () => {
      expect(
        fixture10k.users.filter(
          (user) =>
            !/^bench-user-\d{5}@example\.invalid$/.test(user.email) ||
            !/^bench_user_\d{5}$/.test(user.username) ||
            (user.avatar_url !== null && !user.avatar_url.startsWith("https://example.invalid/")),
        ),
      ).toEqual([]);
      expect(
        fixture10k.locations.filter(
          (location) =>
            !/^benchmark-place-\d{5}$/.test(location.place_id) || !location.full_address.includes("示範路"),
        ),
      ).toEqual([]);
      expect(fixture10k.images.filter((image) => !image.s3_key.startsWith("benchmark/posts/"))).toEqual([]);
    });

    it("contains no phone numbers or email addresses in free text", () => {
      const freeText = [
        ...fixture10k.posts.map((post) => `${post.title} ${post.content} ${post.tags ?? ""}`),
        ...fixture10k.comments.map((comment) => comment.content),
      ];

      expect(freeText.filter((text) => /09\d{8}|\d{2,4}-\d{3,4}-\d{3,4}|@/.test(text))).toEqual([]);
    });
  });

  describe("embeddings", () => {
    const model = new SyntheticEmbeddingModel(DEFAULT_FIXTURE_SEED);

    it("produces reusable unit vectors with the production dimensionality", () => {
      const post = fixture10k.posts[0];
      const vector = model.postVector(post);
      const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

      expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(norm).toBeCloseTo(1, 5);
      expect(new SyntheticEmbeddingModel(DEFAULT_FIXTURE_SEED).postVector(post)).toEqual(vector);
    });

    it("places same-topic posts closer than same-category and cross-category posts", () => {
      const { posts } = fixture10k;
      const [anchor, sameTopic] = posts.filter((post) => post.category_id === 7 && post.topic === 0);
      const sameCategory = posts.find((post) => post.category_id === 7 && post.topic === 1)!;
      const otherCategory = posts.find((post) => post.category_id === 9)!;
      const anchorVector = model.postVector(anchor);

      const topicSimilarity = cosineSimilarity(anchorVector, model.postVector(sameTopic));
      const categorySimilarity = cosineSimilarity(anchorVector, model.postVector(sameCategory));
      const unrelatedSimilarity = cosineSimilarity(anchorVector, model.postVector(otherCategory));

      expect(topicSimilarity).toBeGreaterThan(0.7);
      expect(categorySimilarity).toBeGreaterThan(unrelatedSimilarity + 0.2);
      expect(topicSimilarity).toBeGreaterThan(categorySimilarity + 0.2);
    });

    it("builds interest vectors aligned with a user's liked posts", () => {
      const [userId, likedIds] = Array.from(fixture10k.likedPostIdsByUser).find(
        ([, ids]) => ids.length >= 5,
      )!;
      const postsById = new Map(fixture10k.posts.map((post) => [post.id, post]));
      const likedPosts = likedIds.map((id) => postsById.get(id)!);
      const interest = model.userVector(likedPosts);
      const likedSimilarity =
        likedPosts.reduce((sum, post) => sum + cosineSimilarity(interest, model.postVector(post)), 0) /
        likedPosts.length;
      const likedSet = new Set(likedIds);
      const unliked = fixture10k.posts.filter((post) => !likedSet.has(post.id)).slice(0, 200);
      const unlikedSimilarity =
        unliked.reduce((sum, post) => sum + cosineSimilarity(interest, model.postVector(post)), 0) /
        unliked.length;

      expect(userId).toBeGreaterThan(0);
      expect(likedSimilarity).toBeGreaterThan(unlikedSimilarity);
    });
  });
});
