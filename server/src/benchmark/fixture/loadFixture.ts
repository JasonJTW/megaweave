// server/src/benchmark/fixture/loadFixture.ts
// 將 fixture 載入 benchmark MySQL / Redis。寫入格式與正式程式一致：
// posts.embedding 與 postEmbedding worker 相同、post:{id} / user:{id}:vector 與 worker 相同、
// feed:trending 與 hot score worker 相同，確保 benchmark 走的是真實程式路徑。

import { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { calculatePostHotScore } from "../../queue/jobs/hotScore";
import {
  createPostVectorIndex,
  POST_VECTOR_INDEX,
} from "../../services/vectorIndexService";
import type { AppRedisClient } from "../../utils/redis";
import {
  assertBenchmarkDataStores,
  BENCHMARK_DATA_MARKER,
  BENCHMARK_MARKER_TABLE,
  BENCHMARK_REDIS_MARKER_KEY,
  FixtureStores,
} from "./dataStoreGuard";
import {
  SyntheticEmbeddingModel,
  toEmbeddingJson,
  toFloat32Buffer,
} from "./embeddings";
import { FixtureDataset, FixturePost } from "./generateFixture";

/** 參考資料由 reference-data.sql 匯入，reset 時保留 */
const PRESERVED_TABLES = new Set(["categories", "conditions", BENCHMARK_MARKER_TABLE]);
const ROW_BATCH_SIZE = 1000;
/** 每篇貼文的 embedding JSON 約 30KB，縮小批次以避開 max_allowed_packet */
const POST_BATCH_SIZE = 100;
/** 應用程式的 Redis client 設定 commandsQueueMaxLength=100，同時送出的指令必須低於此上限 */
const REDIS_BATCH_SIZE = 50;

export interface FixtureLoadTimings {
  reset: number;
  mysql: number;
  redis: number;
}

async function insertRows(
  mysql: Pool,
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = ROW_BATCH_SIZE,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    await mysql.query("INSERT INTO ?? (??) VALUES ?", [
      table,
      columns,
      rows.slice(i, i + batchSize),
    ]);
  }
}

async function resetMysql(mysql: Pool): Promise<void> {
  const connection = await mysql.getConnection();
  try {
    const [tables] = await connection.query<RowDataPacket[]>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    );
    // TRUNCATE 需暫停外鍵檢查；僅作用於此連線
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of tables) {
      if (!PRESERVED_TABLES.has(name as string)) {
        await connection.query("TRUNCATE TABLE ??", [name]);
      }
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    connection.release();
  }
}

async function resetRedis(redis: AppRedisClient): Promise<void> {
  await redis.flushDb();
  await redis.set(BENCHMARK_REDIS_MARKER_KEY, BENCHMARK_DATA_MARKER);
}

async function dropPostVectorIndex(redis: AppRedisClient): Promise<void> {
  try {
    await redis.sendCommand(["FT.DROPINDEX", POST_VECTOR_INDEX]);
  } catch (error) {
    const message = String((error as Error)?.message ?? error).toLowerCase();
    if (!message.includes("unknown index") && !message.includes("not found")) throw error;
  }
}

/** 清空 benchmark 資料儲存並重建空的向量索引；參考資料與標記保留。 */
export async function resetFixture(stores: FixtureStores): Promise<void> {
  await assertBenchmarkDataStores(stores);
  await dropPostVectorIndex(stores.vectorRedis);
  await resetMysql(stores.mysql);
  await resetRedis(stores.cacheRedis);
  await resetRedis(stores.vectorRedis);
  await createPostVectorIndex(stores.vectorRedis);
}

async function inChunks<T>(
  values: readonly T[],
  size: number,
  handle: (chunk: readonly T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < values.length; i += size) {
    await handle(values.slice(i, i + size));
  }
}

export async function loadFixture(
  stores: FixtureStores,
  dataset: FixtureDataset,
  anchor: Date = new Date(),
): Promise<FixtureLoadTimings> {
  const anchorMs = Math.floor(anchor.getTime() / 1000) * 1000;
  const at = (offsetSeconds: number) => new Date(anchorMs - offsetSeconds * 1000);
  const model = new SyntheticEmbeddingModel(dataset.seed);
  const { mysql, cacheRedis, vectorRedis } = stores;

  let started = Date.now();
  await resetFixture(stores);
  const resetDuration = Date.now() - started;

  started = Date.now();
  await insertRows(
    mysql,
    "users",
    ["id", "public_id", "username", "email", "role", "avatar_url", "created_at", "updated_at"],
    dataset.users.map((user) => [
      user.id, user.public_id, user.username, user.email, "user", user.avatar_url,
      at(user.created_offset_s), at(user.created_offset_s),
    ]),
  );

  const postsById = new Map(dataset.posts.map((post) => [post.id, post]));
  const userVectors = new Map<number, Float32Array>();
  for (const profile of dataset.userProfiles) {
    if (!profile.has_interest_vector) continue;
    const likedPosts = (dataset.likedPostIdsByUser.get(profile.user_id) ?? []).map(
      (postId) => postsById.get(postId)!,
    );
    userVectors.set(profile.user_id, model.userVector(likedPosts));
  }

  await insertRows(
    mysql,
    "user_profiles",
    ["user_id", "custom_name", "bio", "interest_vector", "vector_updated_at"],
    dataset.userProfiles.map((profile) => {
      const vector = userVectors.get(profile.user_id);
      return [
        profile.user_id, profile.custom_name, profile.bio,
        vector ? toEmbeddingJson(vector) : null,
        vector ? at(0) : null,
      ];
    }),
    POST_BATCH_SIZE,
  );

  await insertRows(
    mysql,
    "locations",
    ["id", "place_id", "name", "full_address", "province", "city", "route", "zip_code", "lat", "lng", "created_at"],
    dataset.locations.map((location) => [
      location.id, location.place_id, location.name, location.full_address, location.province,
      location.city, location.route, location.zip_code, location.lat, location.lng, at(0),
    ]),
  );

  const hotScore = (post: FixturePost): number =>
    post.deleted
      ? 0
      : calculatePostHotScore({
          status: post.status,
          view_count: post.view_count,
          likes_count: post.likes_count,
          comment_count: post.comment_count,
          weave_count: post.weave_count,
          created_at: at(post.created_offset_s),
        });

  const hotScores = new Map<number, number>();
  const postVectorBuffers = new Map<number, Buffer>();
  await inChunks(dataset.posts, POST_BATCH_SIZE, async (chunk) => {
    const rows = chunk.map((post) => {
      const vector = model.postVector(post);
      if (!post.deleted) postVectorBuffers.set(post.id, toFloat32Buffer(vector));
      hotScores.set(post.id, hotScore(post));

      const createdAt = at(post.created_offset_s);
      const createdMs = createdAt.getTime();
      return [
        post.id, post.public_id, post.user_id, post.title, post.content, post.location_id,
        post.type, post.status, post.tags, post.category_id, post.condition_level,
        post.expires_after_s === null ? null : new Date(createdMs + post.expires_after_s * 1000),
        post.view_count, post.likes_count, createdAt, createdAt,
        post.deleted ? new Date(createdMs + Math.floor(post.created_offset_s / 2) * 1000) : null,
        // comment_count 由 after_comment_insert_stats trigger 在插入留言時累加
        0,
        hotScores.get(post.id),
        toEmbeddingJson(vector),
      ];
    });
    await insertRows(
      mysql,
      "posts",
      [
        "id", "public_id", "user_id", "title", "content", "location_id", "type", "status", "tags",
        "category_id", "condition_level", "expires_at", "view_count", "likes_count", "created_at",
        "updated_at", "deleted_at", "comment_count", "hot_score", "embedding",
      ],
      rows,
      POST_BATCH_SIZE,
    );
  });

  await insertRows(
    mysql,
    "items",
    ["id", "post_id", "title", "quantity", "created_at", "updated_at"],
    dataset.items.map((item) => {
      const createdAt = at(postsById.get(item.post_id)!.created_offset_s);
      return [item.id, item.post_id, item.title, item.quantity, createdAt, createdAt];
    }),
  );
  await insertRows(
    mysql,
    "images",
    ["id", "post_id", "s3_key", "alt_text", "file_size", "mime_type", "width", "height", "created_at"],
    dataset.images.map((image) => [
      image.id, image.post_id, image.s3_key, image.alt_text, image.file_size, image.mime_type,
      image.width, image.height, at(postsById.get(image.post_id)!.created_offset_s),
    ]),
  );
  await insertRows(
    mysql,
    "post_likes",
    ["id", "user_id", "post_id", "created_at"],
    dataset.postLikes.map((like) => [like.id, like.user_id, like.post_id, at(like.created_offset_s)]),
  );
  await insertRows(
    mysql,
    "comments",
    ["id", "post_id", "user_id", "content", "created_at", "updated_at"],
    dataset.comments.map((comment) => [
      comment.id, comment.post_id, comment.user_id, comment.content,
      at(comment.created_offset_s), at(comment.created_offset_s),
    ]),
  );
  await insertRows(
    mysql,
    "weaves",
    ["id", "post_id", "giver_id", "receiver_id", "status", "giver_confirmed", "receiver_confirmed", "completed_at", "created_at", "updated_at"],
    dataset.weaves.map((weave) => [
      weave.id, weave.post_id, weave.giver_id, weave.receiver_id, weave.status,
      weave.giver_confirmed, weave.receiver_confirmed,
      weave.completed_offset_s === null ? null : at(weave.completed_offset_s),
      at(weave.created_offset_s), at(weave.created_offset_s),
    ]),
  );
  const mysqlDuration = Date.now() - started;

  started = Date.now();
  await inChunks(Array.from(postVectorBuffers), REDIS_BATCH_SIZE, (chunk) =>
    Promise.all(
      chunk.map(([postId, buffer]) =>
        vectorRedis.hSet(`post:${postId}`, {
          v: buffer,
          post_id: postId,
          // 與 postEmbedding worker 相同：status TAG 實際存放貼文類型
          status: postsById.get(postId)!.type,
        }),
      ),
    ),
  );
  await inChunks(Array.from(userVectors), REDIS_BATCH_SIZE, (chunk) =>
    Promise.all(
      chunk.map(([userId, vector]) =>
        vectorRedis.hSet(`user:${userId}:vector`, {
          v: toFloat32Buffer(vector),
          user_id: userId,
          updated_at: anchorMs,
        }),
      ),
    ),
  );

  const trending = dataset.posts
    .filter((post) => !post.deleted && post.status === "active")
    .map((post) => ({ score: hotScores.get(post.id)!, value: String(post.id) }));
  await inChunks(trending, 1000, (chunk) =>
    cacheRedis.zAdd("feed:trending", [...chunk]),
  );
  const redisDuration = Date.now() - started;

  return { reset: resetDuration, mysql: mysqlDuration, redis: redisDuration };
}
