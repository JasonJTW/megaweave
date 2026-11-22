// server/src/me.ts
// GET /api/me — aggregates all data needed by the client UserPage in one request.
// Replaces: /api/userprofile/bio, /custom_name, /contact_email, /contact_phone,
//           /api/user/stats, /api/posts/user, /api/weaves

import Router, { NextFunction, Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { WEAVE_QUERY_BASE, type WeaveOutput, processWeaveRows } from "./services/weave";
import { UpdateLocaleSchema } from "./validations";

const router = Router();

// ─── GET /api/me ──────────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    try {
      // Run all independent queries in parallel
      const [profileRows, statsRows, postsRows, weaveRows, memberRows] =
        await Promise.all([
          // 1. user_profiles — bio, custom_name, contact_email, contact_phone
          dbPool.execute<RowDataPacket[]>(
            `SELECT bio, custom_name, contact_email, contact_phone
         FROM user_profiles
         WHERE user_id = ?`,
            [userId],
          ),

          // 2. user_stats
          dbPool.execute<RowDataPacket[]>(
            `SELECT post_count, weave_count, points, give_success_rate,
                total_likes, total_views, last_calculated_at
         FROM user_stats
         WHERE user_id = ?`,
            [userId],
          ),

          // 3. user's posts (with images)
          dbPool.execute<RowDataPacket[]>(
            `SELECT p.*, GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) AS s3_keys
         FROM posts p
         LEFT JOIN images i ON p.id = i.post_id
         WHERE p.user_id = ? AND p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
            [userId],
          ),

          // 4. weaves (giver or receiver)
          //* 共用 WEAVE_QUERY_BASE：手抄的 SELECT 少了流向單位與發文者欄位
          dbPool.execute<WeaveOutput[]>(
            `${WEAVE_QUERY_BASE}
         WHERE (w.giver_id = ? OR w.receiver_id = ?)
         GROUP BY w.id
         ORDER BY w.created_at DESC`,
            [userId, userId],
          ),

          // 5. member profile — only queried for contributor/admin, returns [] otherwise
          userRole === "contributor" || userRole === "admin"
            ? dbPool.query<RowDataPacket[]>(
                `SELECT * FROM members WHERE user_id = ?`,
                [userId],
              )
            : Promise.resolve([[]] as unknown as [RowDataPacket[], unknown]),
        ]);

      const profile = (profileRows[0] as RowDataPacket[])[0] ?? {};
      const stats = (statsRows[0] as RowDataPacket[])[0] ?? null;
      const posts = postsRows[0] as RowDataPacket[];
      //* 領取組織物品的人看到的 Giver 是組織名義（#140、ADR 0004）
      const weaves = await processWeaveRows(weaveRows[0] as WeaveOutput[], {
        viewerUserId: userId,
      });
      const member = (memberRows[0] as RowDataPacket[])[0] ?? null;

      return res.status(200).json({
        profile: {
          bio: profile.bio ?? "",
          custom_name:
            (profile.custom_name && profile.custom_name.trim()) ||
            req.user!.username,
          contact_email: profile.contact_email ?? null,
          contact_phone: profile.contact_phone ?? null,
        },
        stats: {
          postCount: stats?.post_count ?? 0,
          weaveCount: stats?.weave_count ?? 0,
          points: stats?.points != null ? Number(stats.points) : 0,
          giveSuccessRate:
            stats?.give_success_rate != null
              ? Number(stats.give_success_rate)
              : 0,
          totalLikes: stats?.total_likes ?? 0,
          totalViews: stats?.total_views ?? 0,
          lastCalculatedAt: stats?.last_calculated_at ?? null,
        },
        posts,
        weaves,
        // null when user is not contributor/admin
        member: member ?? null,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// ─── PUT /api/me/locale ───────────────────────────────────────────────────────
// Called only by the client's language switcher, so visiting /en never changes it.

router.put(
  "/locale",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { locale } = UpdateLocaleSchema.parse(req.body);
      await dbPool.execute("UPDATE users SET locale = ? WHERE id = ?", [
        locale,
        req.user!.userId,
      ]);
      return res.status(200).json({ locale });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
