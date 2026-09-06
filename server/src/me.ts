// server/src/me.ts
// GET /api/me — aggregates all data needed by the client UserPage in one request.
// Replaces: /api/userprofile/bio, /custom_name, /contact_email, /contact_phone,
//           /api/user/stats, /api/posts/user, /api/weaves

import Router, { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { WeaveOutput, processWeaveRows } from "./weaves";

const router = Router();

// ─── GET /api/me ──────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
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
        dbPool.execute<WeaveOutput[]>(
          `SELECT
            w.*,
            p.id AS post_id_original,
            p.user_id AS post_user_id,
            p.title AS post_title,
            p.content AS post_content,
            p.type AS post_type,
            p.status AS post_status_original,
            l.full_address AS post_location,
            l.place_id AS post_place_id,
            l.name AS post_location_name,
            l.url AS post_location_url,
            l.province AS post_province,
            l.city AS post_city,
            l.route AS post_route,
            l.zip_code AS post_zip_code,
            l.lat AS post_lat,
            l.lng AS post_lng,
            p.tags AS post_tags,
            p.category_id AS post_category_id,
            p.condition_level AS post_condition_level,
            p.expires_at AS post_expires_at,
            p.view_count AS post_view_count,
            p.likes_count AS post_likes_count,
            p.created_at AS post_created_at,
            p.updated_at AS post_updated_at,
            p.comment_count AS post_comment_count,
            COALESCE(NULLIF(TRIM(g_up.custom_name), ''), giver.username) AS giver_name,
            giver.avatar_url AS giver_avatar,
            COALESCE(NULLIF(TRIM(r_up.custom_name), ''), receiver.username) AS receiver_name,
            receiver.avatar_url AS receiver_avatar,
            GROUP_CONCAT(img.s3_key ORDER BY img.id ASC) AS s3_keys
         FROM weaves w
         JOIN posts p ON w.post_id = p.id
         LEFT JOIN locations l ON p.location_id = l.id
         JOIN users giver ON w.giver_id = giver.id
         LEFT JOIN user_profiles g_up ON giver.id = g_up.user_id
         JOIN users receiver ON w.receiver_id = receiver.id
         LEFT JOIN user_profiles r_up ON receiver.id = r_up.user_id
         LEFT JOIN images img ON p.id = img.post_id
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
    const weaves = await processWeaveRows(weaveRows[0] as WeaveOutput[]);
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
    console.error("Error fetching /api/me:", error);
    return res.status(500).json({ errorMessage: "Failed to fetch user data" });
  }
});

export default router;
