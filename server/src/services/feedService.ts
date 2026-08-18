// server/src/services/feedService.ts
// 推薦 Feed 核心服務：整合 Redis 向量搜尋 (HNSW KNN)、熱門分數 (HotScore) 與冷啟動 Fallback

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

// ─── 地理距離輔助 (Haversine Formula) ─────────────────────────────────────────

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

async function fetchPostsByIds(postIds: number[]): Promise<Map<number, RowDataPacket>> {
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
      console.warn(`⚠️ Failed to read user vector from Redis (user #${userId}):`, err);
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
      console.warn(`⚠️ Failed to read user vector from MySQL (user #${userId}):`, err);
    }

    return null;
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
        const rawIds = await redis.zRange("feed:trending", offset, offset + limit - 1, {
          REV: true,
        });
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
        .filter((p): p is RowDataPacket => p !== undefined && p.status === "active");

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

    const whereClause = whereConditions.join(" AND ");

    const fallbackQuery = `
      ${POST_FIELDS_SQL}
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY p.hot_score DESC, p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [posts] = await dbPool.execute<RowDataPacket[]>(fallbackQuery, queryParams);

    const [countResult] = await dbPool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM posts p WHERE ${whereClause}`,
      queryParams,
    );
    const dbTotal = countResult[0]?.total || 0;

    return {
      posts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(dbTotal / limit) || 1,
        totalPosts: dbTotal,
        postsPerPage: limit,
      },
      isPersonalized: false,
    };
  }

  /**
   * 老用戶個性化推薦：Redis 向量召回 (FT.SEARCH KNN) + 混合熱門排序 (Hybrid Re-ranking)
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
      // FT.SEARCH idx:posts_v "*=>[KNN 60 @v $vec AS vector_distance]" PARAMS 2 vec <Buffer> SORTBY vector_distance ASC DIALECT 2
      // FT.SEARCH idx:posts_v "*=>[KNN 60 @v $vec AS vector_distance]" PARAMS 2 vec <Buffer> SORTBY vector_distance ASC RETURN 1 vector_distance LIMIT 0 60 DIALECT 2
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
        // rawResult[0] = total results count
        // rawResult[1] = key1 ("post:99"), rawResult[2] = [ "vector_distance", "0.123" ], rawResult[3] = key2 ...
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
            // Redis Cosine Distance = 1 - CosineSimilarity，因此 Similarity = max(0, 1 - distance)
            const similarity = Math.max(0, 1 - distance);
            candidates.push({ postId, distance, similarity });
          }
        }
      }
    } catch (searchErr) {
      console.warn("⚠️ FT.SEARCH vector recall failed, fallback to trending:", searchErr);
      return await this.getTrendingFeed(params);
    }

    // 若向量搜尋無結果（例如貼文尚未建立索引），自動 fallback
    if (candidates.length === 0) {
      return await this.getTrendingFeed(params);
    }

    // 2. 批次 Hydrate 貼文詳細資料
    const postIds = candidates.map((c) => c.postId);
    const postMap = await fetchPostsByIds(postIds);

    // 3. 混合重排 (Hybrid Re-ranking)
    // 找出最大 HotScore 用於正規化
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

    for (const c of candidates) {
      const post = postMap.get(c.postId);
      // 排除已刪除、非 active 或已過期的貼文
      if (!post || post.status !== "active") continue;

      // 類型過濾 (若有指定)
      if (params.type && post.type !== params.type) continue;
      // 分類過濾 (若有指定)
      if (params.category_id && Number(post.category_id) !== Number(params.category_id))
        continue;

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

      scoredPosts.push({ post, finalScore });
    }

    // 依 FinalScore 降冪排序
    scoredPosts.sort((a, b) => b.finalScore - a.finalScore);

    // 分頁切片
    const total = scoredPosts.length;
    const offset = (page - 1) * limit;
    const pagePosts = scoredPosts.slice(offset, offset + limit).map((s) => s.post);

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
   * 統一推薦 Feed 主入口 (Unified Hybrid Feed)
   */
  async getFeed(params: FeedParams): Promise<FeedResult> {
    if (params.userId) {
      const userVector = await this.getUserVector(params.userId);
      if (userVector) {
        return await this.getPersonalizedFeed(userVector, params);
      }
    }

    // 新用戶 / 未登入 / 尚未產生向量 -> 自動走全站熱門 Trending Feed
    return await this.getTrendingFeed(params);
  }
}

export const feedService = new FeedService();
