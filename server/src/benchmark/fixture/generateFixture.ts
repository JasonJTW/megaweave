// server/src/benchmark/fixture/generateFixture.ts
// 純函式 fixture 產生器：同一組 (seed, posts) 永遠產生完全相同的資料。
// 時間欄位以「距離載入時間的秒數」表示，由 loader 在載入當下換算，使貼文新舊、過期比例與 hot score 在任何日期都一致。

import { createHash } from "crypto";
import { EMBEDDING_MODEL_VERSION } from "./embeddings";
import { createRandom, deriveSeed, deterministicUuid, Random } from "./random";
import {
  CATEGORIES,
  CATEGORY_WEIGHTS,
  COMMENT_SENTENCES,
  CONDITION_WORDS,
  CONTENT_SENTENCES,
  DISTRICTS,
  GENERIC_TAGS,
  IMAGE_SIZES,
  QUANTITY_WORDS,
  TITLE_PREFIX,
} from "./vocabulary";

export const FIXTURE_GENERATOR_VERSION = "megaweave-fixture-v1";
export const DEFAULT_FIXTURE_SEED = 20260922;

const DAY_SECONDS = 24 * 60 * 60;
const POSTS_PER_USER = 5;
const POSTS_PER_LOCATION = 25;
const MIN_LIKES_FOR_INTEREST_VECTOR = 3;

export type FixturePostType = "share" | "wish" | "commons";
export type FixtureWeaveStatus = "pending" | "completed" | "cancelled" | "requested";

export interface FixtureOptions {
  seed: number;
  posts: number;
}

export interface FixtureUser {
  id: number;
  public_id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  created_offset_s: number;
  /** 使用者偏好分類，決定其按讚傾向與興趣向量 */
  preferred_category_id: number;
  /** 只瀏覽不按讚的使用者，模擬沒有興趣向量的冷啟動使用者 */
  lurker: boolean;
}

export interface FixtureUserProfile {
  user_id: number;
  custom_name: string | null;
  bio: string | null;
  /** 按讚數達門檻的使用者才有興趣向量；其餘模擬冷啟動使用者 */
  has_interest_vector: boolean;
}

export interface FixtureLocation {
  id: number;
  place_id: string;
  name: string;
  full_address: string;
  province: string;
  city: string;
  route: string;
  zip_code: string;
  lat: number;
  lng: number;
}

export interface FixturePost {
  id: number;
  public_id: string;
  user_id: number;
  title: string;
  content: string;
  location_id: number | null;
  type: FixturePostType;
  status: "active" | "inactive";
  tags: string | null;
  category_id: number;
  condition_level: number;
  /** 向量主題索引（CATEGORIES[].nouns 的位置） */
  topic: number;
  created_offset_s: number;
  /** 相對 created_at 的有效秒數；null 代表不過期 */
  expires_after_s: number | null;
  view_count: number;
  likes_count: number;
  comment_count: number;
  weave_count: number;
  deleted: boolean;
}

export interface FixtureItem {
  id: number;
  post_id: number;
  title: string;
  quantity: number;
}

export interface FixtureImage {
  id: number;
  post_id: number;
  s3_key: string;
  alt_text: string;
  file_size: number;
  mime_type: "image/webp";
  width: number;
  height: number;
}

export interface FixturePostLike {
  id: number;
  user_id: number;
  post_id: number;
  created_offset_s: number;
}

export interface FixtureComment {
  id: number;
  post_id: number;
  user_id: number;
  content: string;
  created_offset_s: number;
}

export interface FixtureWeave {
  id: number;
  post_id: number;
  giver_id: number;
  receiver_id: number;
  status: FixtureWeaveStatus;
  giver_confirmed: boolean;
  receiver_confirmed: boolean;
  created_offset_s: number;
  completed_offset_s: number | null;
}

export interface FixtureCounts extends Record<string, number> {
  users: number;
  userProfiles: number;
  userInterestVectors: number;
  locations: number;
  posts: number;
  activePosts: number;
  deletedPosts: number;
  items: number;
  images: number;
  postLikes: number;
  comments: number;
  weaves: number;
  postEmbeddings: number;
  redisPostVectors: number;
  trendingPosts: number;
}

export interface FixtureDataset {
  version: string;
  seed: number;
  embeddingModel: string;
  users: FixtureUser[];
  userProfiles: FixtureUserProfile[];
  locations: FixtureLocation[];
  posts: FixturePost[];
  items: FixtureItem[];
  images: FixtureImage[];
  postLikes: FixturePostLike[];
  comments: FixtureComment[];
  weaves: FixtureWeave[];
  /** 每位使用者按讚過的貼文 ID，用於計算興趣向量 */
  likedPostIdsByUser: Map<number, number[]>;
  counts: FixtureCounts;
  /** 資料內容的 SHA-256，用於證明兩次產生的資料完全相同 */
  fingerprint: string;
}

function generateUsers(random: Random, count: number): FixtureUser[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const serial = String(id).padStart(5, "0");
    return {
      id,
      public_id: deterministicUuid(random),
      username: `bench_user_${serial}`,
      // RFC 2606 保留網域，保證不會是真實信箱
      email: `bench-user-${serial}@example.invalid`,
      avatar_url: random.chance(0.6)
        ? `https://example.invalid/benchmark/avatars/${serial}.webp`
        : null,
      created_offset_s: random.int(365, 540) * DAY_SECONDS,
      preferred_category_id: random.weighted(CATEGORY_WEIGHTS),
      lurker: random.chance(0.2),
    };
  });
}

function generateLocations(random: Random, count: number): FixtureLocation[] {
  const districtWeights = DISTRICTS.map((district) => [district, district.weight] as const);

  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const district = random.weighted(districtWeights);
    const serial = String(id).padStart(5, "0");
    const route = `示範路${random.int(1, 5)}段`;
    return {
      id,
      place_id: `benchmark-place-${serial}`,
      name: `${district.city}示範地點${serial}`,
      full_address: `${district.zip}${district.province}${district.city}${route}${random.int(1, 300)}號`,
      province: district.province,
      city: district.city,
      route,
      zip_code: district.zip,
      lat: Number((district.lat + (random.next() - 0.5) * 0.03).toFixed(8)),
      lng: Number((district.lng + (random.next() - 0.5) * 0.03).toFixed(8)),
    };
  });
}

/** Zipf-like 抽樣：少數活躍使用者發佈大部分貼文 */
function pickActiveUserId(random: Random, userCount: number): number {
  return Math.min(userCount, 1 + Math.floor(Math.pow(random.next(), 2.2) * userCount));
}

function buildTitle(random: Random, type: FixturePostType, noun: string, conditionLevel: number): string {
  const prefix = random.pick(TITLE_PREFIX[type]);
  if (type === "wish") {
    return `${prefix}${random.pick(["二手", "堪用的", "不用的", ""])}${noun}`;
  }
  const condition = CONDITION_WORDS[conditionLevel - 1];
  return `${prefix}${condition}${noun} ${random.pick(QUANTITY_WORDS)}`;
}

function buildContent(random: Random, noun: string): string {
  // 長度分佈：多數短文、少數長文，讓 response bytes 接近真實貼文
  const sentences = random.weighted([[1, 20], [2, 30], [4, 25], [8, 15], [20, 7], [45, 3]] as const);
  const parts = [`${noun}，${random.pick(CONTENT_SENTENCES)}`];
  for (let i = 1; i < sentences; i++) parts.push(random.pick(CONTENT_SENTENCES));
  return parts.join("").slice(0, 1000);
}

function buildTags(random: Random, categoryTags: readonly string[]): string | null {
  const count = random.weighted([[0, 25], [1, 25], [2, 25], [3, 15], [4, 10]] as const);
  if (count === 0) return null;
  const pool = [...categoryTags, ...GENERIC_TAGS];
  const tags = new Set<string>();
  while (tags.size < count) tags.add(random.pick(pool));
  return Array.from(tags).join(",");
}

/** 對數常態分佈的瀏覽數：中位數約 30，長尾到數千 */
function sampleViewCount(random: Random): number {
  return Math.min(20000, Math.floor(Math.exp(3.4 + 1.1 * random.gaussian())));
}

/** 按讚者偏好：70% 來自偏好該分類的使用者，模擬興趣聚集 */
function pickLikers(
  random: Random,
  count: number,
  post: FixturePost,
  usersByCategory: Map<number, number[]>,
  interactiveUserIds: readonly number[],
): number[] {
  const likers = new Set<number>();
  const affinityUsers = usersByCategory.get(post.category_id) ?? [];
  const maxAttempts = count * 20;

  for (let attempt = 0; likers.size < count && attempt < maxAttempts; attempt++) {
    const userId =
      affinityUsers.length > 0 && random.chance(0.7)
        ? random.pick(affinityUsers)
        : random.pick(interactiveUserIds);
    if (userId !== post.user_id) likers.add(userId);
  }
  return Array.from(likers);
}

function computeFingerprint(dataset: Omit<FixtureDataset, "fingerprint" | "likedPostIdsByUser">): string {
  const hash = createHash("sha256");
  hash.update(`${dataset.version}|${dataset.seed}|${dataset.embeddingModel}\n`);
  const tables = [
    dataset.users,
    dataset.userProfiles,
    dataset.locations,
    dataset.posts,
    dataset.items,
    dataset.images,
    dataset.postLikes,
    dataset.comments,
    dataset.weaves,
  ];
  for (const rows of tables) {
    for (const row of rows) hash.update(`${JSON.stringify(row)}\n`);
  }
  return hash.digest("hex");
}

export function fixtureVersion(options: FixtureOptions): string {
  return `${FIXTURE_GENERATOR_VERSION}-posts${options.posts}-seed${options.seed}`;
}

export function generateFixture(options: FixtureOptions): FixtureDataset {
  if (!Number.isInteger(options.posts) || options.posts < 100) {
    throw new Error("Fixture must contain at least 100 posts");
  }

  // 每類資料使用獨立亂數序列，調整其中一類的產生規則不會改變其他類的資料
  const stream = (name: string) => createRandom(deriveSeed(options.seed, name));
  const userCount = Math.ceil(options.posts / POSTS_PER_USER);
  const users = generateUsers(stream("users"), userCount);
  const locations = generateLocations(
    stream("locations"),
    Math.max(50, Math.ceil(options.posts / POSTS_PER_LOCATION)),
  );

  const interactiveUserIds = users.filter((user) => !user.lurker).map((user) => user.id);
  const usersByCategory = new Map<number, number[]>();
  for (const user of users) {
    if (user.lurker) continue;
    const list = usersByCategory.get(user.preferred_category_id) ?? [];
    list.push(user.id);
    usersByCategory.set(user.preferred_category_id, list);
  }

  const postRandom = stream("posts");
  const posts: FixturePost[] = [];
  const items: FixtureItem[] = [];
  const images: FixtureImage[] = [];

  for (let index = 0; index < options.posts; index++) {
    const id = index + 1;
    const categoryId = postRandom.weighted(CATEGORY_WEIGHTS);
    const category = CATEGORIES.find((c) => c.id === categoryId)!;
    const topic = postRandom.int(0, category.nouns.length - 1);
    const noun = category.nouns[topic];
    const type = postRandom.weighted([["share", 60], ["wish", 30], ["commons", 10]] as const);
    const conditionLevel = postRandom.weighted([[1, 10], [2, 30], [3, 35], [4, 18], [5, 7]] as const);
    const viewCount = sampleViewCount(postRandom);

    const post: FixturePost = {
      id,
      public_id: deterministicUuid(postRandom),
      user_id: pickActiveUserId(postRandom, userCount),
      title: buildTitle(postRandom, type, noun, conditionLevel),
      content: buildContent(postRandom, noun),
      location_id: postRandom.chance(0.85) ? postRandom.int(1, locations.length) : null,
      type,
      status: postRandom.chance(0.85) ? "active" : "inactive",
      tags: buildTags(postRandom, category.tags),
      category_id: categoryId,
      condition_level: conditionLevel,
      topic,
      // 指數分佈：多數貼文集中在近一個半月，最舊一年
      created_offset_s: Math.min(365 * DAY_SECONDS, Math.floor(-Math.log(1 - postRandom.next()) * 45 * DAY_SECONDS)),
      expires_after_s: postRandom.weighted([[14 * DAY_SECONDS, 70], [30 * DAY_SECONDS, 20], [null, 10]] as const),
      view_count: viewCount,
      // 以按讚率決定目標讚數，實際值以產生的 post_likes 為準
      likes_count: Math.min(
        Math.floor(userCount * 0.5),
        Math.floor(viewCount * postRandom.next() * 0.12),
      ),
      comment_count: 0,
      weave_count: 0,
      deleted: postRandom.chance(0.03),
    };
    posts.push(post);

    const itemCount = postRandom.weighted([[0, 30], [1, 35], [2, 15], [3, 10], [4, 5], [5, 5]] as const);
    for (let i = 0; i < itemCount; i++) {
      items.push({
        id: items.length + 1,
        post_id: id,
        title: i === 0 ? noun : postRandom.pick(category.nouns),
        quantity: postRandom.weighted([[1, 60], [2, 20], [3, 10], [5, 10]] as const),
      });
    }

    const imageCount = postRandom.weighted([[0, 15], [1, 30], [2, 20], [3, 15], [4, 10], [5, 10]] as const);
    for (let i = 0; i < imageCount; i++) {
      const [width, height] = postRandom.pick(IMAGE_SIZES);
      images.push({
        id: images.length + 1,
        post_id: id,
        s3_key: `benchmark/posts/${post.public_id}-${i + 1}.webp`,
        alt_text: `Image for post ${id}`,
        file_size: postRandom.int(60_000, 450_000),
        mime_type: "image/webp",
        width,
        height,
      });
    }
  }

  const interactionRandom = stream("interactions");
  const postLikes: FixturePostLike[] = [];
  const comments: FixtureComment[] = [];
  const weaves: FixtureWeave[] = [];
  const likedPostIdsByUser = new Map<number, number[]>();

  for (const post of posts) {
    const likers = pickLikers(interactionRandom, post.likes_count, post, usersByCategory, interactiveUserIds);
    post.likes_count = likers.length;
    for (const userId of likers) {
      postLikes.push({
        id: postLikes.length + 1,
        user_id: userId,
        post_id: post.id,
        created_offset_s: interactionRandom.int(0, post.created_offset_s),
      });
      const liked = likedPostIdsByUser.get(userId) ?? [];
      liked.push(post.id);
      likedPostIdsByUser.set(userId, liked);
    }

    const commentCount = Math.min(
      40,
      Math.floor(post.likes_count * interactionRandom.next() * 0.6) +
        (interactionRandom.chance(0.3) ? interactionRandom.int(1, 2) : 0),
    );
    for (let i = 0; i < commentCount; i++) {
      comments.push({
        id: comments.length + 1,
        post_id: post.id,
        user_id: interactionRandom.int(1, userCount),
        content: interactionRandom.pick(COMMENT_SENTENCES),
        created_offset_s: interactionRandom.int(0, post.created_offset_s),
      });
    }
    post.comment_count = commentCount;

    if (post.type !== "wish" && interactionRandom.chance(0.06)) {
      let receiverId = interactionRandom.int(1, userCount);
      if (receiverId === post.user_id) receiverId = (receiverId % userCount) + 1;
      const status = interactionRandom.weighted([["completed", 50], ["pending", 20], ["requested", 20], ["cancelled", 10]] as const);
      const createdOffset = interactionRandom.int(0, post.created_offset_s);
      weaves.push({
        id: weaves.length + 1,
        post_id: post.id,
        giver_id: post.user_id,
        receiver_id: receiverId,
        status,
        giver_confirmed: status === "completed",
        receiver_confirmed: status === "completed",
        created_offset_s: createdOffset,
        completed_offset_s: status === "completed" ? interactionRandom.int(0, createdOffset) : null,
      });
      post.weave_count = 1;
    }
  }

  const profileRandom = stream("profiles");
  const userProfiles: FixtureUserProfile[] = users.map((user) => ({
    user_id: user.id,
    custom_name: profileRandom.chance(0.3) ? `測試用戶${user.id}` : null,
    bio: profileRandom.chance(0.4) ? "這是 benchmark 用的虛構使用者。" : null,
    has_interest_vector: (likedPostIdsByUser.get(user.id)?.length ?? 0) >= MIN_LIKES_FOR_INTEREST_VECTOR,
  }));

  const liveActivePosts = posts.filter((post) => !post.deleted && post.status === "active").length;
  const counts: FixtureCounts = {
    users: users.length,
    userProfiles: userProfiles.length,
    userInterestVectors: userProfiles.filter((profile) => profile.has_interest_vector).length,
    locations: locations.length,
    posts: posts.length,
    activePosts: liveActivePosts,
    deletedPosts: posts.filter((post) => post.deleted).length,
    items: items.length,
    images: images.length,
    postLikes: postLikes.length,
    comments: comments.length,
    weaves: weaves.length,
    postEmbeddings: posts.length,
    // 與 syncVectorsFromMySQL 相同：所有未刪除貼文都會建立向量索引
    redisPostVectors: posts.filter((post) => !post.deleted).length,
    // 與 hot score worker 相同：只有 active 且未刪除的貼文進入 trending
    trendingPosts: liveActivePosts,
  };

  const withoutFingerprint = {
    version: fixtureVersion(options),
    seed: options.seed,
    embeddingModel: EMBEDDING_MODEL_VERSION,
    users,
    userProfiles,
    locations,
    posts,
    items,
    images,
    postLikes,
    comments,
    weaves,
    counts,
  };

  return {
    ...withoutFingerprint,
    likedPostIdsByUser,
    fingerprint: computeFingerprint(withoutFingerprint),
  };
}
