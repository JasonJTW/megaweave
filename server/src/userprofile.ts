import Router, { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import dotenv from "dotenv";
dotenv.config();

import dbPool from "./utils/db";
import { requireAuth, requireRole } from "./middleware/auth";
import { UserRole, userRoles } from "./schema";
const router = Router();

//RWD: For get & post user profile

router.get("/bio", requireAuth, async (req: Request, res: Response) => {
  let query;
  try {
    //* check if userId exists
    if (!req.user?.userId) {
      return res.status(401).json({
        errorMessage: "User ID not found, Please signin first",
      });
    }

    query = `SELECT * FROM user_profiles WHERE user_id = ?`;
    const [rows] = await dbPool.query(query, [req.user?.userId]);
    console.log("rows:", rows);
    const bio = (rows as RowDataPacket[])[0]?.bio;
    const customName = (rows as RowDataPacket[])[0]?.custom_name;
    if (!customName) {
      console.log("User has no custom name set.");
      query = `UPDATE user_profiles SET custom_name = ? WHERE user_id = ?`;
      await dbPool.query(query, [req.user.username, req.user.userId]);
    }
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

router.post("/bio", requireAuth, async (req: Request, res: Response) => {
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

router.get("/custom_name", requireAuth, async (req: Request, res: Response) => {
  let query;
  if (!req.user) {
    return res.status(404).json({ errorMessage: "Please signin first" });
  }
  const userId = req.user.userId;
  try {
    query = `SELECT custom_name FROM user_profiles WHERE user_id = ?`;
    const [rows] = await dbPool.query(query, [userId]);
    console.log("custom_name rows:", rows);
    const customName = (rows as RowDataPacket[])[0]?.custom_name;

    return res.status(200).json({ custom_name: customName });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ errorMessage: "Failed to fetch user profile" });
  }
});

router.post(
  "/custom_name",
  requireAuth,
  async (req: Request, res: Response) => {
    let query;
    if (!req.user) {
      return res.status(404).json({ errorMessage: "Please signin first" });
    }
    const userId = req.user.userId;
    const newCustomName = req.body.custom_name;
    try {
      query = `Insert into user_profiles (user_id, custom_name) values (?, ?) on duplicate key update custom_name = values(custom_name)`;
      const updateResult = await dbPool.query(query, [userId, newCustomName]);
      res
        .status(200)
        .json({ message: "Profile update successfully", data: updateResult });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ errorMessage: "Failed to update profile" });
    }
  }
);

router.get(
  "/contact_email",
  requireAuth,
  async (req: Request, res: Response) => {
    let query;
    try {
      //* check if userId exists
      if (!req.user?.userId) {
        return res.status(401).json({
          errorMessage: "User ID not found, Please signin first",
        });
      }

      query = `SELECT contact_email FROM user_profiles WHERE user_id = ?`;
      const [rows] = await dbPool.query(query, [req.user?.userId]);
      console.log("rows:", rows);
      const contactEmail = (rows as RowDataPacket[])[0]?.contact_email;
      return res.status(200).json({ contactEmail: contactEmail });
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
  }
);

router.post(
  "/contact_email",
  requireAuth,
  async (req: Request, res: Response) => {
    let query;
    if (!req.user) {
      return res.status(404).json({ errorMessage: "Please signin first" });
    }
    const userId = req.user.userId;
    const newContactEmail = req.body.contact_email;
    console.log("newContactEmail:", newContactEmail);
    try {
      query = `Insert into user_profiles (contact_email, user_id) values (?, ?) on duplicate key update contact_email = values(contact_email)`;
      const updateResult = await dbPool.query(query, [newContactEmail, userId]);
      res.status(200).json({
        message: "Profile update successfully",
        data: updateResult,
        newContactEmail: newContactEmail,
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ errorMessage: "Failed to update profile" });
    }
  }
);

router.get(
  "/contact_phone",
  requireAuth,
  async (req: Request, res: Response) => {
    let query;
    try {
      //* check if userId exists
      if (!req.user?.userId) {
        return res.status(401).json({
          errorMessage: "User ID not found, Please signin first",
        });
      }

      query = `SELECT contact_phone FROM user_profiles WHERE user_id = ?`;
      const [rows] = await dbPool.query(query, [req.user?.userId]);
      console.log("rows:", rows);
      const contactPhone = (rows as RowDataPacket[])[0]?.contact_phone;
      return res.status(200).json({ contactPhone: contactPhone });
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
  }
);

router.post(
  "/contact_phone",
  requireAuth,
  async (req: Request, res: Response) => {
    let query;
    if (!req.user) {
      return res.status(404).json({ errorMessage: "Please signin first" });
    }
    const userId = req.user.userId;
    const newContactPhone = req.body.contact_phone;
    console.log("newContactPhone:", newContactPhone);
    try {
      query = `Insert into user_profiles (contact_phone, user_id) values (?, ?) on duplicate key update contact_phone = values(contact_phone)`;
      const updateResult = await dbPool.query(query, [newContactPhone, userId]);
      res.status(200).json({
        message: "Profile update successfully",
        data: updateResult,
        newContactPhone: newContactPhone,
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ errorMessage: "Failed to update profile" });
    }
  }
);

//RWD userProfile for contributor, displaying on about page
router.get(
  `/${userRoles[2]}`,
  requireAuth,
  requireRole(`${userRoles[2]}`),
  async (req: Request, res: Response) => {
    let query;
    try {
      // 不需要任何角色檢查，中間件已經處理了
      query = `SELECT title, location FROM member WHERE user_id = ?`;
      const [rows] = await dbPool.query(query, [req.user!.userId]);

      const memberData = (rows as RowDataPacket[])[0];

      return res.status(200).json({
        title: memberData?.title || null,
        location: memberData?.location || null,
        role: req.user!.role,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error("DB error:", error.message);
        return res
          .status(500)
          .json({ errorMessage: "Failed to fetch member profile" });
      } else {
        console.error("DB error: ", error);
      }
      return res
        .status(500)
        .json({ errorMessage: "Failed to fetch member profile" });
    }
  }
);

router.post(
  `/${userRoles[2]}`,
  requireAuth,
  requireRole(`${userRoles[2]}`),
  async (req: Request, res: Response) => {
    let query;
    const userId = req.user!.userId;
    const { title, location } = req.body;

    try {
      // 不需要角色檢查，中間件已經處理了
      query = `
      INSERT INTO member (user_id, title, location) 
      VALUES (?, ?, ?) 
      ON DUPLICATE KEY UPDATE 
        title = VALUES(title), 
        location = VALUES(location)
    `;

      const updateResult = await dbPool.query(query, [
        userId,
        title || null,
        location || null,
      ]);

      res.status(200).json({
        message: "Member profile updated successfully",
        data: updateResult,
      });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ errorMessage: "Failed to update member profile" });
    }
  }
);

export default router;
