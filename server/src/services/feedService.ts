// server/src/services/feedService.ts
// 推薦 Feed 核心服務：整合 Redis 向量搜尋 (HNSW KNN)、條件篩選召回 (Two-Stage Retrieval)、個人化向量重排 (Hybrid Re-ranking) 與冷啟動 Fallback

import { RowDataPacket } from "mysql2";
import { RESP_TYPES } from "@redis/client";
import dbPool from "../utils/db";
import { getRedisClient } from "../utils/redis";

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

function parseEmbedding(raw: unknown): Float32Array | null {
  if (!raw) return null;
  try {
    if (Buffer.isBuffer(raw)) {
      return bufferToFloat32Array(raw);
    }
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length > 0) {
      return new Float32Array(arr);
    }
  } catch {
    // ignore parse error
  }
  return null;
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

// ─── 貼文詳細資料 Hydration (MySQL Batch Query) ───────────────────────────────

const POST_FIELDS_SQL = `
  SELECT 
    p.*,
    COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
    u.public_id as author_public_id,
    u.id as author_user_id,
    u.avatar_url,
    c.name_en as category_name_en,
    cond.name as condition_name,
    l.place_id, l.full_address, l.route, l.province, l.city, l.lat, l.lng, l.zip_code,
    GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
  FROM posts p
  LEFT JOIN users u ON p.user_id = u.id
  LEFT JOIN user_profiles up ON u.id = up.user_id
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN conditions cond ON p.condition_level = cond.level
  LEFT JOIN locations l ON p.location_id = l.id
  LEFT JOIN images i ON p.id = i.post_id
`;

async function fetchPostsByIds(
  postIds: number[],
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
    map.set(row.id, row);
  }
  return map;
}

// ─── 核心 Feed 服務類別 ────────────────────────────────────────────────────────

export class FeedService {
  /**
   * 取得使用者的興趣向量 Buffer
   * 1. 優先從 Redis user:{userId}:vector 讀取
   * 2. 若 Redis 沒有，嘗試從 MySQL user_profiles.interest_vector 讀取並轉換
   */
  async getUserVector(userId: number): Promise<Buffer | null> {
    const redis = getRedisClient();

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
          return buf;
        }
      }
    } catch (err) {
      console.warn(
        `⚠️ Failed to read user vector from MySQL (user #${userId}):`,
        err,
      );
    }

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
      whereConditions.push(
        "(l.full_address LIKE ? OR l.city LIKE ? OR l.province LIKE ?)",
      );
      queryParams.push(
        `%${params.location}%`,
        `%${params.location}%`,
        `%${params.location}%`,
      );
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

    const { whereClause, queryParams } = this.buildWhereConditions(params);

    // 1. 計算符合條件的總筆數
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
    const dbTotal = countResult[0]?.total || 0;

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

    // 2. Stage 1: 條件召回 (Candidate Retrieval)
    // 撈取足以覆蓋當前分頁甚至未來頁面的候選貼文（包含 embedding 與 hot_score）
    const CANDIDATE_FETCH_LIMIT = Math.max(150, (page + 2) * limit);
    const candidateQuery = `
      ${POST_FIELDS_SQL}
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY (p.expires_at IS NOT NULL AND p.expires_at < NOW()) ASC, p.hot_score DESC, p.created_at DESC
      LIMIT ${CANDIDATE_FETCH_LIMIT}
    `;

    const [candidates] = await dbPool.execute<RowDataPacket[]>(
      candidateQuery,
      queryParams,
    );

    // 3. Stage 2: 個人化特徵比對與混合計分 (Hybrid Re-ranking)
    let maxHotScore = 1.0;
    for (const post of candidates) {
      if (post.hot_score) {
        maxHotScore = Math.max(maxHotScore, Number(post.hot_score));
      }
    }

    const userVec = userVectorBuffer
      ? bufferToFloat32Array(userVectorBuffer)
      : null;
    const now = Date.now();

    interface ScoredPost {
      post: RowDataPacket;
      finalScore: number;
    }

    const scoredPosts: ScoredPost[] = candidates.map((post) => {
      let similarity = 0.5; // 無使用者向量時預設為中立基準
      if (userVec && post.embedding) {
        const postVec = parseEmbedding(post.embedding);
        if (postVec) {
          similarity = cosineSimilarity(userVec, postVec);
        }
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
        if (distKm <= 5) {
          finalScore *= 1.2; // 5 公里內 +20%
        } else if (distKm <= 15) {
          finalScore *= 1.1; // 15 公里內 +10%
        }
      }

      // 未過期加權（確保未過期貼文排在過期之前）
      const isExpired = post.expires_at
        ? new Date(post.expires_at).getTime() < now
        : false;
      if (!isExpired) {
        finalScore += 10.0;
      }

      return { post, finalScore };
    });

    // 依 FinalScore 降冪排序
    scoredPosts.sort((a, b) => b.finalScore - a.finalScore);

    // 4. 分頁切片 (Slice Pagination)
    const pagePosts = scoredPosts
      .slice(offset, offset + limit)
      .map((s) => s.post);

    return {
      posts: pagePosts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(dbTotal / limit) || 1,
        totalPosts: dbTotal,
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

    const redis = getRedisClient();
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
      const postMap = await fetchPostsByIds(postIds);
      // 依照 Redis ZSET 排列順序重組結果
      const orderedPosts = postIds
        .map((id) => postMap.get(id))
        .filter(
          (p): p is RowDataPacket => p !== undefined && p.status === "active",
        );

      return {
        posts: orderedPosts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalPosts / limit) || 1,
          totalPosts,
          postsPerPage: limit,
        },
        isPersonalized: false,
      };
    }

    // 3. Fallback: 直接從 MySQL 查詢熱門商品
    return await this.getFilteredFeed(params, null);
  }

  /**
   * 老用戶無篩選時之全站個性化推薦：Redis 向量召回 (FT.SEARCH KNN) + 混合熱門排序 (Hybrid Re-ranking)
   */
  async getPersonalizedFeed(
    userVectorBuffer: Buffer,
    params: FeedParams,
  ): Promise<FeedResult> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(50, params.limit || 20));
    const redis = getRedisClient();

    // 1. 向量檢索召回 (KNN 召回 top 60 筆候補商品)
    const CANDIDATE_LIMIT = 60;
    const knnQuery = `*=>[KNN ${CANDIDATE_LIMIT} @v $vec AS vector_distance]`;

    interface Candidate {
      postId: number;
      distance: number;
      similarity: number;
    }
    const candidates: Candidate[] = [];

    try {
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

    // 2. 批次 Hydrate 貼文詳細資料
    const postIds = candidates.map((c) => c.postId);
    const postMap = await fetchPostsByIds(postIds);

    // 3. 混合重排 (Hybrid Re-ranking)
    let maxHotScore = 1.0;
    for (const c of candidates) {
      const post = postMap.get(c.postId);
      if (post && post.hot_score) {
        maxHotScore = Math.max(maxHotScore, Number(post.hot_score));
      }
    }

    interface ScoredPost {
      post: RowDataPacket;
      finalScore: number;
    }
    const scoredPosts: ScoredPost[] = [];
    const now = Date.now();

    for (const c of candidates) {
      const post = postMap.get(c.postId);
      if (!post || post.status !== "active") continue;

      const normalizedHot = Number(post.hot_score || 0) / maxHotScore;

      // 混合公式：FinalScore = 0.7 * VectorSimilarity + 0.3 * NormalizedHotScore
      let finalScore = 0.7 * c.similarity + 0.3 * normalizedHot;

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
        if (distKm <= 5) {
          finalScore *= 1.2; // 5 公里內 +20%
        } else if (distKm <= 15) {
          finalScore *= 1.1; // 15 公里內 +10%
        }
      }

      // 未過期加權
      const isExpired = post.expires_at
        ? new Date(post.expires_at).getTime() < now
        : false;
      if (!isExpired) {
        finalScore += 10.0;
      }

      scoredPosts.push({ post, finalScore });
    }

    // 依 FinalScore 降冪排序
    scoredPosts.sort((a, b) => b.finalScore - a.finalScore);

    // 分頁切片
    const total = scoredPosts.length;
    const offset = (page - 1) * limit;
    const pagePosts = scoredPosts
      .slice(offset, offset + limit)
      .map((s) => s.post);

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
    const hasFilters = Boolean(
      params.type ||
      params.category_id ||
      params.city ||
      params.province ||
      params.location ||
      params.search,
    );

    let userVectorBuffer: Buffer | null = null;
    if (params.userId) {
      userVectorBuffer = await this.getUserVector(params.userId);
    }

    // 1. 若有特定篩選條件（分類、Wish/Share、地點、搜尋詞），走「條件召回 + 個人化重排」
    if (hasFilters) {
      return await this.getFilteredFeed(params, userVectorBuffer);
    }

    // 2. 無篩選條件：登入老用戶走 Redis 向量檢索 (KNN) + 混合重排
    if (userVectorBuffer) {
      return await this.getPersonalizedFeed(userVectorBuffer, params);
    }

    // 3. 無篩選條件：新用戶 / 未登入走全站熱門 Trending Feed
    return await this.getTrendingFeed(params);
  }
}

export const feedService = new FeedService();
