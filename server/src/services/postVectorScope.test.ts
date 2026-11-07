/**
 * 向量索引的 `scope` TAG（ADR 0003）：每篇貼文在 idx:posts_v 裡帶一個可見範圍，
 * 公開介面的 KNN 先以 `@scope:{public}` 預先過濾，K 筆候選才會全是公開貼文。
 *
 * Redis 換成記憶體裡的 hash 表、MySQL 換成記憶體裡的 posts 列，斷言停在 Redis hash 的內容。
 */

import type { SqlExecutor } from "./postVisibility";
import {
  backfillPostVectorScopes,
  publicKnnQuery,
  syncPostVectorScope,
  vectorScopeOf,
} from "./postVectorScope";

type Hash = Record<string, string | number | Buffer>;

function fakeRedis(seed: Record<string, Hash> = {}) {
  const hashes = new Map<string, Hash>(
    Object.entries(seed).map(([key, hash]) => [key, { ...hash }]),
  );
  return {
    hashes,
    exists: jest.fn(async (key: string) => (hashes.has(key) ? 1 : 0)),
    hSet: jest.fn(async (key: string, fields: Hash) => {
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields });
      return Object.keys(fields).length;
    }),
  };
}

interface PostRow {
  id: number;
  org_id: number | null;
  audience_tier: string;
  deleted_at?: string | null;
  embedding?: string | null;
}

function fakeDb(rows: PostRow[]): SqlExecutor {
  return {
    execute: jest.fn(async (rawSql: string, params: unknown[]) => {
      const sql = rawSql.replace(/\s+/g, " ").trim();
      const alive = rows.filter((r) => !r.deleted_at);
      if (
        sql ===
        "SELECT org_id, audience_tier FROM posts WHERE id = ? AND deleted_at IS NULL"
      ) {
        return [alive.filter((r) => r.id === params[0])];
      }
      const page = sql.match(
        /^SELECT id, org_id, audience_tier FROM posts WHERE deleted_at IS NULL AND embedding IS NOT NULL AND id > \? ORDER BY id ASC LIMIT (\d+)$/,
      );
      if (page) {
        const rowsAfter = alive
          .filter((r) => r.embedding && r.id > Number(params[0]))
          .sort((a, b) => a.id - b.id)
          .slice(0, Number(page[1]));
        return [rowsAfter];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
  } as unknown as SqlExecutor;
}

const VECTOR = Buffer.from([1, 2, 3, 4]);

describe("vectorScopeOf", () => {
  it.each([
    ["a personal post", { orgId: null, audienceTier: "public" }, "public"],
    ["a Public-tier org post", { orgId: 12, audienceTier: "public" }, "public"],
    ["a Members-tier org post", { orgId: 12, audienceTier: "members" }, "org:12:members"],
    ["an Internal-tier org post", { orgId: 12, audienceTier: "internal" }, "org:12:internal"],
  ] as const)("gives %s the scope %s", (_label, post, scope) => {
    expect(vectorScopeOf(post)).toBe(scope);
  });
});

describe("publicKnnQuery", () => {
  it("prefilters the KNN to public-scope documents", () => {
    expect(publicKnnQuery(150)).toBe(
      "(@scope:{public})=>[KNN 150 @v $vec AS vector_distance]",
    );
  });
});

describe("syncPostVectorScope", () => {
  it("rewrites the scope of an indexed post from MySQL, keeping its vector", async () => {
    const redis = fakeRedis({
      "post:5": { v: VECTOR, post_id: 5, status: "share", scope: "org:7:internal" },
    });
    const db = fakeDb([{ id: 5, org_id: 7, audience_tier: "public" }]);

    await syncPostVectorScope(db, redis, 5);

    expect(redis.hashes.get("post:5")).toEqual({
      v: VECTOR,
      post_id: 5,
      status: "share",
      scope: "public",
    });
  });

  it("does not create a hash for a post that has no vector yet", async () => {
    const redis = fakeRedis();
    const db = fakeDb([{ id: 5, org_id: 7, audience_tier: "members" }]);

    await syncPostVectorScope(db, redis, 5);

    expect(redis.hashes.has("post:5")).toBe(false);
  });

  it("leaves a deleted post's leftover hash out of the public scope", async () => {
    const redis = fakeRedis({ "post:5": { v: VECTOR, post_id: 5, scope: "public" } });
    const db = fakeDb([
      { id: 5, org_id: null, audience_tier: "public", deleted_at: "2026-11-01" },
    ]);

    await syncPostVectorScope(db, redis, 5);

    expect(redis.hashes.get("post:5")?.scope).not.toBe("public");
  });
});

describe("backfillPostVectorScopes", () => {
  const rows: PostRow[] = [
    { id: 1, org_id: null, audience_tier: "public", embedding: "[0.1]" },
    { id: 2, org_id: 7, audience_tier: "public", embedding: "[0.1]" },
    { id: 3, org_id: 7, audience_tier: "members", embedding: "[0.1]" },
    { id: 4, org_id: 7, audience_tier: "internal", embedding: "[0.1]" },
    //* 還沒有向量的貼文：Redis 裡也沒有 hash
    { id: 5, org_id: null, audience_tier: "public", embedding: null },
  ];

  function seededRedis() {
    return fakeRedis({
      "post:1": { v: VECTOR, post_id: 1, status: "share" },
      "post:2": { v: VECTOR, post_id: 2, status: "share" },
      "post:3": { v: VECTOR, post_id: 3, status: "share" },
      "post:4": { v: VECTOR, post_id: 4, status: "share" },
    });
  }

  it("sets the scope on every indexed post, across batches", async () => {
    const redis = seededRedis();

    const result = await backfillPostVectorScopes(fakeDb(rows), redis, 2);

    expect(result).toEqual({ scanned: 4, updated: 4 });
    expect(
      [1, 2, 3, 4].map((id) => redis.hashes.get(`post:${id}`)?.scope),
    ).toEqual(["public", "public", "org:7:members", "org:7:internal"]);
    expect(redis.hashes.get("post:1")?.v).toBe(VECTOR);
    expect(redis.hashes.has("post:5")).toBe(false);
  });

  it("is safe to run again", async () => {
    const redis = seededRedis();
    await backfillPostVectorScopes(fakeDb(rows), redis, 2);
    const once = new Map(redis.hashes);

    const again = await backfillPostVectorScopes(fakeDb(rows), redis, 2);

    expect(again).toEqual({ scanned: 4, updated: 4 });
    expect(redis.hashes).toEqual(once);
  });
});
