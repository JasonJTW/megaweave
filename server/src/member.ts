import dbPool from "./utils/db";
import { RowDataPacket } from "mysql2";
import Router, { Request, Response } from "express";
import dotenv from "dotenv";
import { requireAuth, requireRole } from "./middleware/auth";
import { userRoles } from "./schema";
dotenv.config();

const router = Router();

//RWD userProfile for contributor, displaying on about page

router.get(`/all`, async (req: Request, res: Response) => {
  const { userId } = req.query;

  let query: string;
  let queryParams: any[] = [];

  if (userId) {
    query = `SELECT * FROM members WHERE user_id = ?`;
    queryParams = [userId];
  } else {
    query = `SELECT * FROM members`;
  }

  try {
    const [row] = await dbPool.query(query, queryParams);
    console.log(
      userId ? `Member data for userId ${userId}: ` : "All members data: ",
      row
    );
    return res.status(200).json(row);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ errorMessage: "Failed to fetch all members" });
  }
});

router.post(
  `/`,
  requireAuth,
  requireRole(userRoles[1], userRoles[2]),
  async (req: Request, res: Response) => {
    let query;
    const userId = req.user!.userId;
    const { member_name, title, location, email, member_bio, websites } =
      req.body;

    try {
      if (!member_name?.trim()) {
        return res.status(400).json({
          errorMessage: "Member name is required",
        });
      }
      // 不需要角色檢查，中間件已經處理了
      query = `
      INSERT INTO member (user_id, member_name, title, location, email, member_bio, websites) 
      VALUES (?, ?, ?, ?, ?, ?, ?) 
      ON DUPLICATE KEY UPDATE 
        member_name = VALUES(member_name),
        title = VALUES(title), 
        location = VALUES(location),
        email = VALUES(email),
        member_bio = VALUES(member_bio),
        websites = VALUES(websites)
    `;

      const [result] = await dbPool.query(query, [
        userId,
        member_name || null,
        title || null,
        location || null,
        email || null,
        member_bio || null,
        websites || null,
      ]);
      console.log("Member profile upsert result: ", result);
      res.status(200).json({
        message: "Member profile updated successfully",
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ errorMessage: "Failed to update member profile" });
    }
  }
);

export default router;
