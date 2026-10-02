import { getCacheRedisClient } from "./redis";

const VIEW_COOLDOWN_SECONDS = 60 * 60; // 設定冷卻時間：1小時
const REDIS_VIEW_KEY_PREFIX = "view_cooldown";

/**
 * 檢查是否應該增加瀏覽次數
 * @param postId 貼文 ID
 * @param viewerIdentifier 瀏覽者識別碼 (UserId 或 IP)
 * @returns boolean - true 代表應該增加計數, false 代表在冷卻中
 */
export async function shouldIncrementView(
  postId: number,
  viewerIdentifier: string
): Promise<boolean> {
  const redis = getCacheRedisClient();
  const key = `${REDIS_VIEW_KEY_PREFIX}:${postId}:${viewerIdentifier}`;

  try {
    //* SET NX EX 單一原子指令：key 不存在才寫入（回 "OK"），避免併發請求重複計數
    const result = await redis.set(key, "1", {
      EX: VIEW_COOLDOWN_SECONDS,
      NX: true,
    });

    return result === "OK"; // null 代表還在冷卻時間內
  } catch (error) {
    console.error("Redis view counter error:", error);
    // Redis 錯誤時預設允許計數，避免功能完全停擺
    return true;
  }
}
