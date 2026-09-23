// server/src/benchmark/queue/durableState.ts
// 讀取 burst 結束後實際留下的結果：MySQL 貼文向量與圖片列、Redis 向量，以及 mock S3 的上傳與 staging 物件。

import { RowDataPacket } from "mysql2";
import type { AppStores } from "../fixture/fixtureProfile";
import { REDIS_BATCH_SIZE } from "../fixture/loadFixture";
import type { MockS3 } from "../mocks/mockS3";
import type { ConsistencyInput, ObservedState } from "./consistency";

/** 分批送出，讓同時等待回覆的 Redis 指令低於應用程式 client 的 commandsQueueMaxLength */
async function mapInBatches<T, R>(values: readonly T[], read: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < values.length; i += REDIS_BATCH_SIZE) {
    results.push(...(await Promise.all(values.slice(i, i + REDIS_BATCH_SIZE).map(read))));
  }
  return results;
}

export type DurableStateStores = Pick<AppStores, "mysql" | "vectorRedis">;

export async function observeDurableState(
  stores: DurableStateStores,
  s3: Pick<MockS3, "uploads" | "hasObject">,
  buckets: { bucket: string; stagingBucket: string },
  expected: ConsistencyInput,
): Promise<ObservedState> {
  const postIds = expected.posts.map((post) => post.postId);
  const stagingKeys = expected.posts.flatMap((post) => post.stagingKeys);
  const userIds = [...new Set(expected.userVectors.map((user) => user.userId))];
  const [embeddingRows] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT id, JSON_LENGTH(embedding) AS dimensions FROM posts WHERE id IN (?)",
    [postIds],
  );
  const [imageRows] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT post_id, s3_key FROM images WHERE post_id IN (?) ORDER BY id",
    [postIds],
  );
  const vectorBytes = await mapInBatches(postIds, (id) => stores.vectorRedis.hStrLen(`post:${id}`, "v"));
  const userUpdatedAt = await mapInBatches(userIds, (id) => stores.vectorRedis.hGet(`user:${id}:vector`, "updated_at"));

  const dimensions = new Map(embeddingRows.map((row) => [Number(row.id), row.dimensions === null ? null : Number(row.dimensions)]));
  const imageKeysByPost = new Map<number, string[]>();
  for (const row of imageRows) {
    const keys = imageKeysByPost.get(Number(row.post_id)) ?? [];
    keys.push(String(row.s3_key));
    imageKeysByPost.set(Number(row.post_id), keys);
  }
  return {
    embeddings: new Map(
      postIds.map((id, index) => [id, { mysqlDimensions: dimensions.get(id) ?? null, redisVectorBytes: Number(vectorBytes[index]) }]),
    ),
    imageKeysByPost,
    storage: {
      uploadsByKey: s3.uploads(buckets.bucket),
      remainingStagingKeys: new Set(stagingKeys.filter((key) => s3.hasObject(buckets.stagingBucket, key))),
    },
    userVectorUpdatedAtMs: new Map(userIds.map((id, index) => [id, userUpdatedAt[index] ? Number(userUpdatedAt[index]) : null])),
  };
}
