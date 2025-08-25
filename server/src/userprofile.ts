import Router, { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import dotenv from "dotenv";
dotenv.config();

import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";

const router = Router();

//RWD: For get & post user profile

router.get("/", requireAuth, async (req: Request, res: Response) => {
  let query;
  try {
    //* check if userId exists
    if (!req.user?.userId) {
      return res.status(401).json({
        errorMessage: "User ID not found, Please signin first",
      });
    }

    query = `SELECT bio FROM user_profiles WHERE user_id = ?`;
    const [rows] = await dbPool.query(query, [req.user?.userId]);
    console.log("rows:", rows);
    const bio = (rows as RowDataPacket[])[0]?.bio;
    return res.status(200).json({ bio: bio });
  } catch (error) {
    if (error instanceof Error) {
      console.error("DB error:", error.message);
      return res
        .status(500)
        .json({ errorMessage: "Failed to fetch user profile" });
    } else {
      console.error("DB error: ", error);
    }
    return res
      .status(500)
      .json({ errorMessage: "Failed to fetch user profile" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  let query;
  if (!req.user) {
    return res.status(404).json({ errorMessage: "Please signin first" });
  }
  const userId = req.user.userId;
  const newBio = req.body.bio;
  try {
    query = `Insert into user_profiles (user_id, bio) values (?, ?) on duplicate key update bio = values(bio)`;
    const updateResult = await dbPool.query(query, [userId, newBio]);
    res
      .status(200)
      .json({ message: "Profile update successfully", data: updateResult });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ errorMessage: "Failed to update profile" });
  }
});
export default router;
