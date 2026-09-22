// server/src/benchmark/fixture/validateFixture.ts
// 載入後驗證：實際寫入的筆數、互動計數與向量索引都必須與 fixture 預期一致，
// 避免「看似成功的載入」掩蓋遺漏或重複的資料。

import { RowDataPacket } from "mysql2";
import {
  getNumDocsFromFtInfo,
  POST_VECTOR_INDEX,
} from "../../services/vectorIndexService";
import { FixtureStores } from "./dataStoreGuard";
import { EMBEDDING_DIMENSIONS } from "./embeddings";
import { FixtureDataset } from "./generateFixture";

export interface FixtureCheck {
  name: string;
  expected: number;
  actual: number;
  ok: boolean;
}

export class FixtureValidationError extends Error {
  constructor(public readonly checks: FixtureCheck[]) {
    const failed = checks
      .filter((check) => !check.ok)
      .map((check) => `${check.name}: expected ${check.expected}, got ${check.actual}`);
    super(`Fixture validation failed: ${failed.join("; ")}`);
    this.name = "FixtureValidationError";
  }
}

async function countKeys(stores: FixtureStores, pattern: string): Promise<number> {
  let count = 0;
  for await (const keys of stores.vectorRedis.scanIterator({ MATCH: pattern, COUNT: 1000 })) {
    count += Array.isArray(keys) ? keys.length : 1;
  }
  return count;
}

export async function validateFixture(
  stores: FixtureStores,
  dataset: FixtureDataset,
): Promise<FixtureCheck[]> {
  const [[mysqlCounts]] = await stores.mysql.query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM user_profiles) AS userProfiles,
      (SELECT COUNT(*) FROM user_profiles WHERE interest_vector IS NOT NULL) AS userInterestVectors,
      (SELECT COUNT(*) FROM locations) AS locations,
      (SELECT COUNT(*) FROM posts) AS posts,
      (SELECT COUNT(*) FROM posts WHERE status = 'active' AND deleted_at IS NULL) AS activePosts,
      (SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL) AS deletedPosts,
      (SELECT COUNT(*) FROM items) AS items,
      (SELECT COUNT(*) FROM images) AS images,
      (SELECT COUNT(*) FROM post_likes) AS postLikes,
      (SELECT COUNT(*) FROM comments) AS comments,
      (SELECT COUNT(*) FROM weaves) AS weaves,
      (SELECT COUNT(*) FROM posts WHERE JSON_LENGTH(embedding) = ${EMBEDDING_DIMENSIONS}) AS postEmbeddings,
      (SELECT COUNT(*) FROM posts p
         LEFT JOIN (SELECT post_id, COUNT(*) AS c FROM post_likes GROUP BY post_id) l ON l.post_id = p.id
         WHERE p.likes_count <> COALESCE(l.c, 0)) AS likesCountMismatches,
      (SELECT COUNT(*) FROM posts p
         LEFT JOIN (SELECT post_id, COUNT(*) AS c FROM comments GROUP BY post_id) c ON c.post_id = p.id
         WHERE p.comment_count <> COALESCE(c.c, 0)) AS commentCountMismatches
  `);

  const ftInfo = await stores.vectorRedis.sendCommand(["FT.INFO", POST_VECTOR_INDEX]);
  const actual: Record<string, number> = {
    ...Object.fromEntries(
      Object.entries(mysqlCounts).map(([key, value]) => [key, Number(value)]),
    ),
    redisPostVectors: getNumDocsFromFtInfo(ftInfo),
    redisUserVectors: await countKeys(stores, "user:*:vector"),
    trendingPosts: await stores.cacheRedis.zCard("feed:trending"),
  };
  const expected: Record<string, number> = {
    ...dataset.counts,
    redisUserVectors: dataset.counts.userInterestVectors,
    likesCountMismatches: 0,
    commentCountMismatches: 0,
  };

  const checks = Object.keys(actual).map((name) => ({
    name,
    expected: expected[name],
    actual: actual[name],
    ok: expected[name] === actual[name],
  }));

  if (checks.some((check) => !check.ok)) {
    throw new FixtureValidationError(checks);
  }
  return checks;
}
