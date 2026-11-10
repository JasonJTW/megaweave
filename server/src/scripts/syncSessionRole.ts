// server/src/scripts/syncSessionRole.ts
// 直接改了 DB 的 users.role 之後，把新 role 寫進這些 user 在所有裝置上的 Redis session，
// 不用等 session 過期，也不會把人登出。下一個請求時 user-role cookie 會跟著更新。
//
//   本機：  cd server && npm run session:sync-role -- 12 34
//   正式機：（server container 內）APP_ROLE=api node dist/scripts/syncSessionRole.js 12 34
//
// 只找得到這次改版後登入、或改版後用過一次的 session（舊 session 第一次使用時才會加進索引）。

import { z } from "zod";
import { RowDataPacket } from "mysql2";
import dbPool from "../utils/db";
import { connectRedis, disconnectRedis } from "../utils/redis";
import { updateSessionsForUser } from "../session";
import { userRoles } from "../schema";

const userIdsSchema = z.array(z.coerce.number().int().positive()).min(1);
const roleSchema = z.enum(userRoles);

async function main() {
  const parsed = userIdsSchema.safeParse(process.argv.slice(2));
  if (!parsed.success) {
    console.error("Usage: syncSessionRole <userId> [userId...]");
    return 1;
  }

  await connectRedis();
  let failed = false;
  for (const userId of parsed.data) {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT role FROM users WHERE id = ?",
      [userId],
    );
    if (rows.length === 0) {
      console.error(`❌ user ${userId}: not found`);
      failed = true;
      continue;
    }
    const role = roleSchema.safeParse(rows[0].role);
    if (!role.success) {
      console.error(`❌ user ${userId}: unknown role ${String(rows[0].role)}`);
      failed = true;
      continue;
    }
    const updated = await updateSessionsForUser(userId, { role: role.data });
    console.log(`✅ user ${userId}: role=${role.data}, ${updated} session(s) updated`);
  }
  return failed ? 1 : 0;
}

main()
  .then(async (code) => {
    await disconnectRedis();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error("❌ syncSessionRole failed:", error);
    await disconnectRedis().catch(() => {});
    process.exit(1);
  });
