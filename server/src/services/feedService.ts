// server/src/services/feedService.ts
// 推薦 Feed 核心服務：整合 Redis 向量搜尋 (HNSW KNN)、條件篩選召回 (Two-Stage Retrieval)、個人化向量重排 (Hybrid Re-ranking) 與冷啟動 Fallback

import { RowDataPacket } from "mysql2";
import { RESP_TYPES } from "@redis/client";
import dbPool from "../utils/db";
import { getCacheRedisClient, getVectorRedisClient } from "../utils/redis";
import { locationService } from "./locationService";
import { fetchQueryEmbedding } from "./embeddingService";

export interface FeedParams {
  userId?: number;
  page?: number;
  limit?: number;
  type?: string;
  category_id?: number;
  search?: string;
  location?: string;
  city?: string;
  province?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  mode?: string;
  /**
   * Benchmark 專用對照組：候選貼文直接做完整 6 表 hydration（含 MySQL embedding），
   * 重現 late materialization 之前的做法；排序公式與回傳資料與現行策略相同。
   * 只由帶隔離標記的 benchmark API 設定，production 永遠不會啟用。
   */
  fullHydrationBaseline?: boolean;
}

export interface FeedResult {
  posts: RowDataPacket[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalPosts: number;
    postsPerPage: number;
  };
  isPersonalized: boolean;
}

// ─── 數學與向量輔助函式 ────────────────────────────────────────────────────────

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // 地球半徑 (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function bufferToFloat32Array(buf: Buffer): Float32Array {
  // 如果 byteOffset 是 4 的倍數，直接使用 zero-copy TypedArray view
  if (buf.byteOffset % 4 === 0) {
    return new Float32Array(
      buf.buffer,
      buf.byteOffset,
      Math.floor(buf.byteLength / 4),
    );
  }
  // 否則建立對齊的 ArrayBuffer 複製，避免 RangeError
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(
    new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
  );
  return new Float32Array(ab, 0, Math.floor(buf.byteLength / 4));
}

function cosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, dot / (Math.sqrt(normA) * Math.sqrt(normB)));
}

/**
 * 依據距離與模式計算地理位置加權倍率 (Geo Boost Multiplier)
 */
function getGeoMultiplier(distKm: number, mode?: string): number {
  if (mode === "tinder") {
    //* 🎯 Tinder 專屬大幅非線性距離加權
    if (distKm <= 3) return 2.0; // 3 公里內超近生活圈 +100%
    if (distKm <= 7) return 1.5; // 7 公里內 +50%
    if (distKm <= 15) return 1.2; // 15 公里內 +20%
    return 1.0;
  }

  // 🏠 首頁與一般 Feed
  if (distKm <= 5) return 1.2; // 5 公里內 +20%
  if (distKm <= 15) return 1.1; // 15 公里內 +10%
  return 1.0;
}

// ─── 貼文詳細資料 Hydration (MySQL Batch Query) ───────────────────────────────

const POST_COLUMNS_SQL = `
    p.id, p.public_id, p.user_id, p.title, p.content, p.type, p.status, p.tags, 
    p.category_id, p.condition_level, p.expires_at, p.view_count, 
    p.likes_count, p.hot_score, p.created_at, p.updated_at, p.deleted_at, p.location_id,
    COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
    u.public_id as author_public_id,
    u.id as author_user_id,
    u.avatar_url,
    c.name_en as category_name_en,
    cond.name as condition_name,
    l.place_id, l.name as location_name, l.url as location_url, l.full_address, l.route, l.province, l.city, l.lat, l.lng, l.zip_code,
    GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys`;

const POST_JOINS_SQL = `
  FROM posts p
  LEFT JOIN users u ON p.user_id = u.id
  LEFT JOIN user_profiles up ON u.id = up.user_id
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN conditions cond ON p.condition_level = cond.level
  LEFT JOIN locations l ON p.location_id = l.id
  LEFT JOIN images i ON p.id = i.post_id
`;

const POST_FIELDS_SQL = `SELECT ${POST_COLUMNS_SQL} ${POST_JOINS_SQL}`;

function parseEmbedding(raw: unknown): Float32Array | null {
  if (!raw) return null;
  try {
    const values = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(values) && values.length === 1536) {
      return new Float32Array(values);
    }
  } catch {
    // 格式錯誤時與 Redis 缺少向量相同，以中立相似度排序
  }
  return null;
}

async function fetchPostsByIds(
  postIds: number[],
  userId?: number,
): Promise<Map<number, RowDataPacket>> {
  if (postIds.length === 0) return new Map();

  const placeholders = postIds.map(() => "?").join(",");
  const query = `
    ${POST_FIELDS_SQL}
    WHERE p.id IN (${placeholders}) AND p.deleted_at IS NULL
    GROUP BY p.id
  `;

  const [rows] = await dbPool.execute<RowDataPacket[]>(query, postIds);
  const map = new Map<number, RowDataPacket>();
  for (const row of rows) {
    row.is_liked = false; // default
    map.set(row.id, row);
  }

  // Batch-stamp is_liked for logged-in users
  if (userId && map.size > 0) {
    await stampIsLiked(Array.from(map.values()), userId);
  }

  return map;
}

/**
 * Batch-query post_likes and stamp is_liked = true on matching posts.
 * Mutates the post objects in-place.
 */
async function stampIsLiked(
  posts: RowDataPacket[],
  userId: number,
): Promise<void> {
  if (posts.length === 0) return;
  const ids = posts.map((p) => p.id as number);
  const placeholders = ids.map(() => "?").join(",");
  const [likedRows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT post_id FROM post_likes WHERE user_id = ? AND post_id IN (${placeholders})`,
    [userId, ...ids],
  );
  const likedSet = new Set<number>(likedRows.map((r) => r.post_id as number));
  for (const post of posts) {
    post.is_liked = likedSet.has(post.id as number);
  }
}

/** 只查詢打分所需欄位（不 JOIN images/users），供 late materialization 的候選重排使用。 */
async function fetchCandidateScoringFields(
  postIds: number[],
): Promise<Map<number, RowDataPacket>> {
  const placeholders = postIds.map(() => "?").join(",");
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT p.id, p.hot_score, p.expires_at, p.status, l.lat, l.lng
     FROM posts p
     LEFT JOIN locations l ON p.location_id = l.id
     WHERE p.id IN (${placeholders}) AND p.deleted_at IS NULL`,
    postIds,
  );
  return new Map(rows.map((row) => [row.id as number, row]));
}

/** Full-hydration baseline：候選列已含完整欄位，只需為當頁貼文標記 is_liked。 */
async function pickHydratedPosts(
  candidates: RowDataPacket[],
  pagePostIds: number[],
  userId?: number,
): Promise<Map<number, RowDataPacket>> {
  const candidateById = new Map(candidates.map((row) => [Number(row.id), row]));
  const map = new Map<number, RowDataPacket>();
  for (const id of pagePostIds) {
    const row = candidateById.get(id);
    if (!row) continue;
    row.is_liked = false;
    map.set(id, row);
  }
  if (userId && map.size > 0) {
    await stampIsLiked(Array.from(map.values()), userId);
  }
  return map;
}

// ─── 核心 Feed 服務類別 ────────────────────────────────────────────────────────

// Post Vector 本地記憶體快取（貼文向量生成後即不變，快取於 Node 記憶體避免反覆向 Redis 請求）
const POST_VECTOR_CACHE_MAX = 2000;
const postVectorMemoryCache = new Map<number, Float32Array>();

// 候選貼文向量讀取統計：累計自 process 啟動，供 benchmark 判斷個人化排序是否因 Redis 讀取失敗而降級
const candidateVectorReadStats = { reads: 0, failed: 0, missing: 0, cacheHits: 0 };

export function getCandidateVectorReadStats(): {
  reads: number;
  failed: number;
  missing: number;
  /** 由 postVectorMemoryCache 直接取得、未讀取 Redis 的候選向量數 */
  cacheHits: number;
} {
  return { ...candidateVectorReadStats };
}

// User Vector 本地記憶體快取（5 分鐘 TTL，避免每次請求都重複花費 300ms+ 連線至遠端 Redis）
const USER_VECTOR_CACHE_TTL_MS = 5 * 60 * 1000;
const userVectorMemoryCache = new Map<
  number,
  { buf: Buffer; expiresAt: number }
>();

export class FeedService {
  /**
   * 取得使用者的興趣向量 Buffer
   * 0. 優先從本地記憶體快取讀取 (0ms)
   * 1. 次之從 Redis user:{userId}:vector 讀取
   * 2. 若 Redis 沒有，嘗試從 MySQL user_profiles.interest_vector 讀取並轉換
   */
  async getUserVector(userId: number): Promise<Buffer | null> {
    // const t0 = performance.now();
    const now = Date.now();

    // 0. 本地記憶體快取
    const cached = userVectorMemoryCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.buf;
    }

    const redis = getVectorRedisClient();

    // 1. Redis 讀取
    try {
      const raw = await redis.sendCommand<Buffer | null>(
        ["HGET", `user:${userId}:vector`, "v"],
        {
          typeMapping: {
            [RESP_TYPES.BLOB_STRING]: Buffer,
          },
        },
      );
      if (raw && Buffer.isBuffer(raw) && raw.length === 1536 * 4) {
        userVectorMemoryCache.set(userId, {
          buf: raw,
          expiresAt: now + USER_VECTOR_CACHE_TTL_MS,
        });
        return raw;
      }
    } catch (err) {
      console.warn(
        `⚠️ Failed to read user vector from Redis (user #${userId}):`,
        err,
      );
    }

    // 2. MySQL Fallback
    try {
      const [rows] = await dbPool.execute<RowDataPacket[]>(
        "SELECT interest_vector FROM user_profiles WHERE user_id = ?",
        [userId],
      );
      if (rows.length > 0 && rows[0].interest_vector) {
        const raw = rows[0].interest_vector;
        const vec: number[] =
          typeof raw === "string" ? JSON.parse(raw) : (raw as number[]);

        if (Array.isArray(vec) && vec.length > 0) {
          const buf = Buffer.alloc(vec.length * 4);
          for (let i = 0; i < vec.length; i++) {
            buf.writeFloatLE(vec[i], i * 4);
          }
          userVectorMemoryCache.set(userId, {
            buf,
            expiresAt: now + USER_VECTOR_CACHE_TTL_MS,
          });
          // console.log(
          //   `🔍 [getUserVector] from MySQL user #${userId} took ${(performance.now() - t0).toFixed(1)}ms`,
          // );
          return buf;
        }
      }
    } catch (err) {
      console.warn(
        `⚠️ Failed to read user vector from MySQL (user #${userId}):`,
        err,
      );
    }

    // console.log(
    //   `🔍 [getUserVector] user #${userId} NOT FOUND (took ${(performance.now() - t0).toFixed(1)}ms)`,
    // );
    return null;
  }

  /**
   * 建構篩選 SQL 條件 (WHERE 子句)
   */
  private buildWhereConditions(params: FeedParams): {
    whereClause: string;
    queryParams: (string | number)[];
  } {
    const whereConditions = ["p.status = 'active'", "p.deleted_at IS NULL"];
    const queryParams: (string | number)[] = [];

    if (params.type) {
      whereConditions.push("p.type = ?");
      queryParams.push(params.type);
    }

    if (params.category_id) {
      whereConditions.push("p.category_id = ?");
      queryParams.push(params.category_id);
    }

    if (params.city || params.province) {
      if (params.city && params.province) {
        whereConditions.push("l.province = ? AND l.city = ?");
        queryParams.push(params.province, params.city);
      } else if (params.province) {
        whereConditions.push("l.province = ?");
        queryParams.push(params.province);
      } else if (params.city) {
        whereConditions.push("l.city = ?");
        queryParams.push(params.city);
      }
    } else if (params.location) {
      const condition = locationService.buildLocationSearchCondition(
        params.location,
      );
      whereConditions.push(condition.sql);
      queryParams.push(...condition.params);
    }

    if (params.search) {
      whereConditions.push(
        "(p.title LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)",
      );
      queryParams.push(
        `%${params.search}%`,
        `%${params.search}%`,
        `%${params.search}%`,
      );
    }

    // 距離半徑篩選 (Radius filter via MySQL ST_Distance_Sphere)
    if (
      params.radius !== undefined &&
      params.radius > 0 &&
      params.lat !== undefined &&
      params.lng !== undefined
    ) {
      whereConditions.push(
        "(l.lat IS NULL OR l.lng IS NULL OR ST_Distance_Sphere(point(l.lng, l.lat), point(?, ?)) <= ?)",
      );
      queryParams.push(params.lng, params.lat, params.radius * 1000);
    }

    return {
      whereClause: whereConditions.join(" AND "),
      queryParams,
    };
  }

  /**
   * 🌟 條件篩選 + 個人化混合重排 (Two-Stage Hybrid Re-ranking)
   * 適用於：使用者帶有任何過濾條件（分類、Wish/Share、地點、關鍵字）時的推薦排序
   */
  async getFilteredFeed(
    params: FeedParams,
    userVectorBuffer: Buffer | null,
  ): Promise<FeedResult> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(50, params.limit || 20));
    const offset = (page - 1) * limit;

    // const t0 = performance.now();
    const { whereClause, queryParams } = this.buildWhereConditions(params);

    //* 1. 計算符合條件的總筆數 (Tinder 模式為卡片串流瀏覽，省去全表 COUNT 掃描)
    let dbTotal = 0;
    // let tCount = 0;
    if (params.mode !== "tinder") {
      // const tCount0 = performance.now();
      const countQuery = `
        SELECT COUNT(DISTINCT p.id) as total 
        FROM posts p 
        LEFT JOIN locations l ON p.location_id = l.id
        WHERE ${whereClause}
      `;
      const [countResult] = await dbPool.execute<RowDataPacket[]>(
        countQuery,
        queryParams,
      );
      dbTotal = countResult[0]?.total || 0;
      // tCount = performance.now() - tCount0;

      if (dbTotal === 0) {
        return {
          posts: [],
          pagination: {
            currentPage: page,
            totalPages: 1,
            totalPosts: 0,
            postsPerPage: limit,
          },
          isPersonalized: Boolean(userVectorBuffer),
        };
      }
    }

    //* 2. Stage 1: 輕量條件召回 (Candidate Retrieval - 不 SELECT embedding 大欄位，走純索引排序)
    // const tCand0 = performance.now();
    const CANDIDATE_FETCH_LIMIT = Math.max(60, (page + 1) * limit);
    const fullHydration = Boolean(params.fullHydrationBaseline);
    const candidateQuery = fullHydration
      ? `
      SELECT ${POST_COLUMNS_SQL}${userVectorBuffer ? ", p.embedding" : ""}
      ${POST_JOINS_SQL}
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY p.hot_score DESC, p.id DESC
      LIMIT ${CANDIDATE_FETCH_LIMIT}
    `
      : `
      SELECT 
        p.id, p.hot_score, p.expires_at, p.status,
        l.lat, l.lng
      FROM posts p
      LEFT JOIN locations l ON p.location_id = l.id
      WHERE ${whereClause}
      ORDER BY p.hot_score DESC, p.id DESC
      LIMIT ${CANDIDATE_FETCH_LIMIT}
    `;

    const [candidates] = await dbPool.execute<RowDataPacket[]>(
      candidateQuery,
      queryParams,
    );
    // const tCand = performance.now() - tCand0;

    if (candidates.length === 0) {
      return {
        posts: [],
        pagination: {
          currentPage: page,
          totalPages: 1,
          totalPosts: 0,
          postsPerPage: limit,
        },
        isPersonalized: Boolean(userVectorBuffer),
      };
    }

    // 3. Stage 2: 個人化特徵比對與混合計分 (Hybrid Re-ranking)
    // const tScore0 = performance.now();
    let maxHotScore = 1.0;
    for (const post of candidates) {
      if (post.hot_score) {
        maxHotScore = Math.max(maxHotScore, Number(post.hot_score));
      }
    }

    const userVec = userVectorBuffer
      ? bufferToFloat32Array(userVectorBuffer)
      : null;

    // 🌟 延遲加載 Embedding (Late Materialization)：記憶體快取 + Redis Pipeline 讀取 Float32 向量
    const candPostIds = candidates.map((p) => Number(p.id));
    const embeddingMap = new Map<number, Float32Array>();
    if (userVec && fullHydration) {
      for (const post of candidates) {
        const vec = parseEmbedding(post.embedding);
        if (vec) embeddingMap.set(Number(post.id), vec);
      }
    } else if (userVec && candPostIds.length > 0) {
      const missingIds: number[] = [];
      for (const id of candPostIds) {
        const cached = postVectorMemoryCache.get(id);
        if (cached) {
          embeddingMap.set(id, cached);
          candidateVectorReadStats.cacheHits++;
        } else {
          missingIds.push(id);
        }
      }

      if (missingIds.length > 0) {
        try {
          const redis = getVectorRedisClient();
          let failedReads = 0;
          let firstError: unknown = null;
          const rawBuffers = await Promise.all(
            missingIds.map((id) =>
              Promise.resolve(
                redis.sendCommand<Buffer | null>(["HGET", `post:${id}`, "v"], {
                  typeMapping: {
                    [RESP_TYPES.BLOB_STRING]: Buffer,
                  },
                }),
              ).catch((err: unknown) => {
                // 單篇讀取失敗時以中立相似度排序，但必須計數，否則個人化降級不可見
                failedReads++;
                firstError ??= err;
                return null;
              }),
            ),
          );
          let validVectors = 0;
          for (let i = 0; i < missingIds.length; i++) {
            const buf = rawBuffers[i];
            if (buf && Buffer.isBuffer(buf) && buf.length === 1536 * 4) {
              const vec = bufferToFloat32Array(buf);
              embeddingMap.set(missingIds[i], vec);
              if (postVectorMemoryCache.size < POST_VECTOR_CACHE_MAX) {
                postVectorMemoryCache.set(missingIds[i], vec);
              }
              validVectors++;
            }
          }
          candidateVectorReadStats.reads += missingIds.length;
          candidateVectorReadStats.failed += failedReads;
          // 成功讀取但 Redis 沒有該貼文向量（或長度不符）
          candidateVectorReadStats.missing += missingIds.length - validVectors - failedReads;
          if (failedReads > 0) {
            // 每個請求只記一行，避免高負載時每個 key 各印一次
            console.warn(
              `⚠️ ${failedReads}/${missingIds.length} candidate vector reads failed; ranking those posts with neutral similarity:`,
              firstError instanceof Error ? firstError.message : firstError,
            );
          }
        } catch (redisErr) {
          console.warn(
            "⚠️ Failed to fetch candidate vectors from Redis:",
            redisErr,
          );
        }
      }
    }

    const now = Date.now();

    interface ScoredCandidate {
      id: number;
      finalScore: number;
    }

    const scoredCandidates: ScoredCandidate[] = candidates.map((post) => {
      let similarity = 0.5; // 無使用者向量時預設為中立基準
      const postVec = embeddingMap.get(Number(post.id));
      if (userVec && postVec) {
        similarity = cosineSimilarity(userVec, postVec);
      }

      const normalizedHot = Number(post.hot_score || 0) / maxHotScore;

      // 混合公式：FinalScore = 0.7 * VectorSimilarity + 0.3 * NormalizedHotScore
      let finalScore = userVec
        ? 0.7 * similarity + 0.3 * normalizedHot
        : normalizedHot;

      // 地理位置加權 (Geo Boost)
      if (
        params.lat !== undefined &&
        params.lng !== undefined &&
        post.lat !== null &&
        post.lng !== null
      ) {
        const distKm = calculateDistanceKm(
          params.lat,
          params.lng,
          Number(post.lat),
          Number(post.lng),
        );
        finalScore *= getGeoMultiplier(distKm, params.mode);
      }

      // 未過期加權（確保未過期貼文排在過期之前）
      const isExpired = post.expires_at
        ? new Date(post.expires_at).getTime() < now
        : false;
      if (!isExpired) {
        finalScore += 10.0;
      }

      return { id: Number(post.id), finalScore };
    });

    // 依 FinalScore 降冪排序
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

    // 4. 分頁切片取得當前頁 post IDs
    const pagePostIds = scoredCandidates
      .slice(offset, offset + limit)
      .map((s) => s.id);
    // const tScore = performance.now() - tScore0;

    // 5. 🌟 延遲關聯 (Late Materialization)：只對當前頁所需的貼文 (例如 12 篇) 批次查詢 6 表詳細資料
    // const tHydrate0 = performance.now();
    const postMap = fullHydration
      ? await pickHydratedPosts(candidates, pagePostIds, params.userId)
      : await fetchPostsByIds(pagePostIds, params.userId);
    const pagePosts = pagePostIds
      .map((id) => postMap.get(id))
      .filter((p): p is RowDataPacket => Boolean(p));
    // const tHydrate = performance.now() - tHydrate0;

    // console.log(
    //   `📊 [getFilteredFeed] count=${tCount.toFixed(1)}ms, candQuery(${candidates.length})=${tCand.toFixed(1)}ms, scoring=${tScore.toFixed(1)}ms, hydrate(${pagePosts.length})=${tHydrate.toFixed(1)}ms -> total=${(performance.now() - t0).toFixed(1)}ms`,
    // );

    const actualTotal =
      params.mode === "tinder"
        ? pagePosts.length === limit
          ? (page + 1) * limit
          : (page - 1) * limit + pagePosts.length
        : dbTotal;

    return {
      posts: pagePosts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(actualTotal / limit) || 1,
        totalPosts: actualTotal,
        postsPerPage: limit,
      },
      isPersonalized: Boolean(userVectorBuffer),
    };
  }

  /**
   * 冷啟動 / 新用戶 / 無向量時：全站熱門 Trending Feed
   */
  async getTrendingFeed(params: FeedParams): Promise<FeedResult> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(50, params.limit || 20));
    const offset = (page - 1) * limit;

    const redis = getCacheRedisClient();
    let postIds: number[] = [];
    let totalPosts = 0;

    // 1. 嘗試從 Redis ZSET feed:trending 取得已排好熱門分數的 post ID
    try {
      totalPosts = await redis.zCard("feed:trending");
      if (totalPosts > 0) {
        // ZREVRANGE: 由高分到低分取出 offset ~ offset + limit - 1
        const rawIds = await redis.zRange(
          "feed:trending",
          offset,
          offset + limit - 1,
          {
            REV: true,
          },
        );
        postIds = rawIds.map((id) => Number(id)).filter((id) => !isNaN(id));
      }
    } catch (err) {
      console.warn("⚠️ Redis ZSET feed:trending read error:", err);
    }

    // 2. 若 Redis 取得成功且有 ID，批次 Hydrate DB 詳細資料
    if (postIds.length > 0) {
      const postMap = await fetchPostsByIds(postIds, params.userId);
      const posts = postIds
        .map((id) => postMap.get(id))
        .filter((p): p is RowDataPacket => Boolean(p));

      return {
        posts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalPosts / limit) || 1,
          totalPosts,
          postsPerPage: limit,
        },
        isPersonalized: false,
      };
    }

    // 3. Fallback: Redis 為空時，降級查 MySQL (無個人化向量)
    return await this.getFilteredFeed(params, null);
  }

  /**
   * 使用者主動搜尋時，以 query embedding 做 Redis HNSW KNN 召回。
   * MySQL 只負責套用目前的業務篩選與 hydration，讓搜尋意圖不被個人化 feed 覆蓋。
   */
  async getSemanticSearchFeed(params: FeedParams): Promise<FeedResult> {
    const query = params.search?.trim() ?? "";
    if (!query) return this.getFilteredFeed({ ...params, search: undefined }, null);
    if (query.length > 300) {
      throw new Error("SEARCH_QUERY_TOO_LONG");
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(50, params.limit || 20));
    // 先過度召回，讓 MySQL 的分類、地點、狀態篩選後仍保有足夠結果。
    const candidateLimit = Math.min(500, Math.max(100, (page + 1) * limit * 10));
    let queryVector: Buffer;
    try {
      queryVector = await fetchQueryEmbedding(query);
    } catch (error) {
      // OpenAI 暫時不可用時，保留原本的關鍵字搜尋作為可用性 fallback。
      console.warn("⚠️ Query embedding failed; falling back to keyword search:", error);
      return this.getFilteredFeed(params, null);
    }
    const redis = getVectorRedisClient();

    interface VectorCandidate {
      postId: number;
      similarity: number;
    }
    const candidates: VectorCandidate[] = [];

    try {
      const knnQuery = `*=>[KNN ${candidateLimit} @v $vec AS vector_distance]`;
      const rawResult = (await redis.sendCommand([
        "FT.SEARCH",
        "idx:posts_v",
        knnQuery,
        "PARAMS",
        "2",
        "vec",
        queryVector,
        "SORTBY",
        "vector_distance",
        "ASC",
        "RETURN",
        "1",
        "vector_distance",
        "LIMIT",
        "0",
        String(candidateLimit),
        "DIALECT",
        "2",
      ])) as unknown[];

      for (let i = 1; Array.isArray(rawResult) && i < rawResult.length; i += 2) {
        const postId = Number(String(rawResult[i] ?? "").replace("post:", ""));
        const fields = rawResult[i + 1];
        let distance = 1;
        if (Array.isArray(fields)) {
          for (let f = 0; f < fields.length; f += 2) {
            if (fields[f] === "vector_distance") {
              distance = Number(fields[f + 1]) || 0;
              break;
            }
          }
        }
        if (Number.isInteger(postId) && postId > 0) {
          candidates.push({ postId, similarity: Math.max(0, 1 - distance) });
        }
      }
    } catch (error) {
      console.warn("⚠️ Semantic vector search failed; falling back to keyword search:", error);
      return this.getFilteredFeed(params, null);
    }

    if (candidates.length === 0) {
      return {
        posts: [],
        pagination: { currentPage: page, totalPages: 1, totalPosts: 0, postsPerPage: limit },
        isPersonalized: false,
      };
    }

    const { whereClause, queryParams } = this.buildWhereConditions({
      ...params,
      search: undefined,
    });
    const candidateIds = candidates.map((candidate) => candidate.postId);
    const placeholders = candidateIds.map(() => "?").join(",");
    const [matchingRows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT p.id, p.hot_score, p.expires_at, l.lat, l.lng
       FROM posts p
       LEFT JOIN locations l ON p.location_id = l.id
       WHERE p.id IN (${placeholders}) AND ${whereClause}`,
      [...candidateIds, ...queryParams],
    );
    const matchingById = new Map<number, RowDataPacket>();
    for (const row of matchingRows) matchingById.set(Number(row.id), row);

    const maxHotScore = Math.max(1, ...matchingRows.map((row) => Number(row.hot_score || 0)));
    const ranked = candidates.flatMap((candidate) => {
      const post = matchingById.get(candidate.postId);
      if (!post) return [];
      let score = 0.85 * candidate.similarity + 0.15 * (Number(post.hot_score || 0) / maxHotScore);
      if (params.lat !== undefined && params.lng !== undefined && post.lat !== null && post.lng !== null) {
        score *= getGeoMultiplier(calculateDistanceKm(params.lat, params.lng, Number(post.lat), Number(post.lng)), params.mode);
      }
      return [{ postId: candidate.postId, score }];
    });
    ranked.sort((a, b) => b.score - a.score);

    const offset = (page - 1) * limit;
    const pagePostIds = ranked.slice(offset, offset + limit).map((candidate) => candidate.postId);
    const postMap = await fetchPostsByIds(pagePostIds, params.userId);
    const posts = pagePostIds
      .map((id) => postMap.get(id))
      .filter((post): post is RowDataPacket => Boolean(post));

    return {
      posts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(ranked.length / limit) || 1,
        totalPosts: ranked.length,
        postsPerPage: limit,
      },
      isPersonalized: false,
    };
  }

  /**
   * 登入老用戶：Redis 向量檢索 (HNSW KNN) + 混合重排 (Hybrid Re-ranking)
   */
  async getPersonalizedFeed(
    userVectorBuffer: Buffer,
    params: FeedParams,
  ): Promise<FeedResult> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(50, params.limit || 20));

    const redis = getVectorRedisClient();
    const CANDIDATE_LIMIT = Math.max(150, (page + 2) * limit);

    interface CandidateInfo {
      postId: number;
      distance: number;
      similarity: number;
    }
    const candidates: CandidateInfo[] = [];

    // 1. Redis HNSW 向量檢索召回 (KNN Top-K)
    try {
      const knnQuery = `*=>[KNN ${CANDIDATE_LIMIT} @v $vec AS vector_distance]`;
      const rawResult = (await redis.sendCommand([
        "FT.SEARCH",
        "idx:posts_v",
        knnQuery,
        "PARAMS",
        "2",
        "vec",
        userVectorBuffer,
        "SORTBY",
        "vector_distance",
        "ASC",
        "RETURN",
        "1",
        "vector_distance",
        "LIMIT",
        "0",
        String(CANDIDATE_LIMIT),
        "DIALECT",
        "2",
      ])) as unknown[];

      if (Array.isArray(rawResult) && rawResult.length > 1) {
        for (let i = 1; i < rawResult.length; i += 2) {
          const key = String(rawResult[i] || "");
          const postId = Number(key.replace("post:", ""));
          const fields = rawResult[i + 1];

          let distance = 1.0;
          if (Array.isArray(fields)) {
            for (let f = 0; f < fields.length; f += 2) {
              if (fields[f] === "vector_distance") {
                distance = parseFloat(String(fields[f + 1])) || 0.0;
                break;
              }
            }
          }

          if (!isNaN(postId) && postId > 0) {
            const similarity = Math.max(0, 1 - distance);
            candidates.push({ postId, distance, similarity });
          }
        }
      }
    } catch (searchErr) {
      console.warn(
        "⚠️ FT.SEARCH vector recall failed, fallback to DB feed:",
        searchErr,
      );
      return await this.getFilteredFeed(params, userVectorBuffer);
    }

    // 若向量搜尋無結果（例如貼文尚未建立索引），自動 fallback
    if (candidates.length === 0) {
      return await this.getFilteredFeed(params, userVectorBuffer);
    }

    // 2. 🌟 延遲關聯 (Late Materialization)：先輕量查詢候選 150 篇的打分欄位 (不 JOIN images/users)
    const postIds = candidates.map((c) => c.postId);
    // Baseline：一次完整 hydration 全部候選（含 is_liked），再從中切出當頁
    const hydratedCandidates = params.fullHydrationBaseline
      ? await fetchPostsByIds(postIds, params.userId)
      : null;
    const candidateMetaMap =
      hydratedCandidates ?? (await fetchCandidateScoringFields(postIds));

    // 3. 混合重排 (Hybrid Re-ranking)
    let maxHotScore = 1.0;
    for (const c of candidates) {
      const meta = candidateMetaMap.get(c.postId);
      if (meta && meta.hot_score) {
        maxHotScore = Math.max(maxHotScore, Number(meta.hot_score));
      }
    }

    interface ScoredPostCandidate {
      postId: number;
      finalScore: number;
    }
    const scoredCandidates: ScoredPostCandidate[] = [];
    const now = Date.now();

    for (const c of candidates) {
      const meta = candidateMetaMap.get(c.postId);
      if (!meta || meta.status !== "active") continue;

      const normalizedHot = Number(meta.hot_score || 0) / maxHotScore;

      // 混合公式：FinalScore = 0.7 * VectorSimilarity + 0.3 * NormalizedHotScore
      let finalScore = 0.7 * c.similarity + 0.3 * normalizedHot;

      // 地理位置加權 (Geo Boost)
      if (
        params.lat !== undefined &&
        params.lng !== undefined &&
        meta.lat !== null &&
        meta.lng !== null
      ) {
        const distKm = calculateDistanceKm(
          params.lat,
          params.lng,
          Number(meta.lat),
          Number(meta.lng),
        );
        finalScore *= getGeoMultiplier(distKm, params.mode);
      }

      // 未過期加權
      const isExpired = meta.expires_at
        ? new Date(meta.expires_at).getTime() < now
        : false;
      if (!isExpired) {
        finalScore += 10.0;
      }

      scoredCandidates.push({ postId: c.postId, finalScore });
    }

    // 依 FinalScore 降冪排序
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

    // 分頁切片取得當前頁 post IDs
    const total = scoredCandidates.length;
    const offset = (page - 1) * limit;
    const pagePostIds = scoredCandidates
      .slice(offset, offset + limit)
      .map((s) => s.postId);

    // 🌟 延遲關聯 (Late Materialization)：只對當前頁所需貼文 (例如 12 篇) 批次查詢 6 表詳細資料
    const postMap =
      hydratedCandidates ?? (await fetchPostsByIds(pagePostIds, params.userId));
    const pagePosts = pagePostIds
      .map((id) => postMap.get(id))
      .filter((p): p is RowDataPacket => Boolean(p));

    return {
      posts: pagePosts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        totalPosts: total,
        postsPerPage: limit,
      },
      isPersonalized: true,
    };
  }

  /**
   * 🌟 統一推薦 Feed 主入口 (Unified Hybrid Feed)
   */
  async getFeed(params: FeedParams): Promise<FeedResult> {
    if (params.search?.trim()) {
      return this.getSemanticSearchFeed(params);
    }

    const hasFilters = Boolean(
      params.type ||
      params.category_id ||
      params.city ||
      params.province ||
      params.location,
    );

    const userVectorBuffer: Buffer | null = params.userId
      ? await this.getUserVector(params.userId)
      : null;

    let result: FeedResult;

    if (params.mode === "tinder" || hasFilters) {
      result = await this.getFilteredFeed(params, userVectorBuffer);
    } else if (userVectorBuffer) {
      result = await this.getPersonalizedFeed(userVectorBuffer, params);
    } else if (params.lat !== undefined && params.lng !== undefined) {
      result = await this.getFilteredFeed(params, null);
    } else {
      result = await this.getTrendingFeed(params);
    }

    for (const post of result.posts) {
      delete post.embedding;
    }

    return result;
  }
}

export const feedService = new FeedService();

/** 測試輔助函式：清空記憶體向量快取以保證單元測試隔離 */
export function clearVectorMemoryCachesForTest(): void {
  resetFeedVectorCaches();
  candidateVectorReadStats.reads = 0;
  candidateVectorReadStats.failed = 0;
  candidateVectorReadStats.missing = 0;
  candidateVectorReadStats.cacheHits = 0;
}

/** 清空記憶體向量快取；benchmark 以此建立 cold-cache 情境，計數器保留以便計算區間差值。 */
export function resetFeedVectorCaches(): void {
  postVectorMemoryCache.clear();
  userVectorMemoryCache.clear();
}

export function getFeedVectorCacheSizes(): {
  postVectors: number;
  postVectorCapacity: number;
  userVectors: number;
} {
  return {
    postVectors: postVectorMemoryCache.size,
    postVectorCapacity: POST_VECTOR_CACHE_MAX,
    userVectors: userVectorMemoryCache.size,
  };
}
