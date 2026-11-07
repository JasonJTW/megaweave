//* client 從 API 回應帶回來的 id：格式錯代表 client bug，呼叫端一律回 INVALID_REQUEST
import { z } from "zod";

/** posts.id：JSON 數字或 multipart 的十進位字串（不吃 true、["5"] 這類被 coerce 成數字的值） */
export const PostIdSchema = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().positive());

/** organizations.public_id */
export const OrgIdSchema = z.uuid();
