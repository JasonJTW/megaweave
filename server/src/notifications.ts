import Router, { Request, Response } from "express";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { RowDataPacket } from "mysql2";

const router = Router();

// GET / - Get user's notifications
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  try {
    const [notifications] = await dbPool.execute<RowDataPacket[]>(
      `SELECT n.*, 
              s.username as sender_name, 
              s.avatar_url as sender_avatar
       FROM notifications n
       LEFT JOIN users s ON n.sender_id = s.id
       WHERE n.recipient_id = ?
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit.toString(), offset.toString()]
    );

    // Get unread count
    const [countResult] = await dbPool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as unread_count 
       FROM notifications 
       WHERE recipient_id = ? AND is_read = 0`,
      [userId]
    );

    res.status(200).json({
      notifications,
      unreadCount: countResult[0].unread_count,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// PATCH /:id/read - Mark single notification as read
router.patch("/:id/read", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const notificationId = req.params.id;

  try {
    await dbPool.execute(
      `UPDATE notifications 
       SET is_read = 1 
       WHERE id = ? AND recipient_id = ?`,
      [notificationId, userId]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// PUT /read-all - Mark all as read
router.put("/read-all", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    await dbPool.execute(
      `UPDATE notifications 
       SET is_read = 1 
       WHERE recipient_id = ?`,
      [userId]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;