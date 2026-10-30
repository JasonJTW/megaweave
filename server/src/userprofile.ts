import Router, { Request, Response, NextFunction } from "express";
import { RowDataPacket } from "mysql2";
import dotenv from "dotenv";
dotenv.config();

import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { updateUserSession } from "./session";
import { HttpError } from "./utils/httpError";
const router = Router();

//* public get profile api
router.get("/public/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const { uuid } = req.params;

  try {
    // 驗證 UUID 格式
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      return next(new HttpError(400, "INVALID_REQUEST", "Invalid user ID format"));
    }

    // console.log(`Fetching public profile for user: ${uuid}`);

    // 1. 獲取用戶基本資料 (通過 public_id)
    const userQuery = `
      SELECT 
        id,
        public_id,
        username,
        email,
        avatar_url,
        avatar_key,
        role,
        created_at
      FROM users 
      WHERE public_id = ?
    `;
    const [userRows] = await dbPool.query(userQuery, [uuid]);

    if ((userRows as RowDataPacket[]).length === 0) {
      console.log(`User not found: ${uuid}`);
      return next(new HttpError(404, "USER_NOT_FOUND", "User not found"));
    }

    const user = (userRows as RowDataPacket[])[0];
    // console.log(`Found user: ${user.username} (id: ${user.id})`);

    // 2. 使用 users.id 來查詢 user_profiles
    const profileQuery = `
      SELECT *
      FROM user_profiles 
      WHERE user_id = ?
    `;
    const [profileRows] = await dbPool.query(profileQuery, [user.id]); // 🔥 使用 user.id 而不是 uuid
    const profile = (profileRows as RowDataPacket[])[0] || {};

    // console.log(`Profile data:`, profile);

    // 3. 組合回傳資料
    const responseData = {
      public_id: user.public_id, // 🔥 返回 public_id (UUID)
      username: (profile.custom_name && profile.custom_name.trim()) || user.username,
      email: user.email, // 可選：是否要公開 email
      avatar_url: user.avatar_url,
      avatar_key: user.avatar_key,
      role: user.role,
      created_at: user.created_at,
      bio: profile.bio || "",
      contact_email: profile.contact_email || null,
      contact_phone: profile.contact_phone || null,
    };

    // console.log(`Returning profile data for ${user.username}`);
    return res.status(200).json(responseData);
  } catch (error) {
    return next(error);
  }
});

//RWD: For get & post user profile
router.get("/bio", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  let query;
  try {
    //* check if userId exists
    if (!req.user?.userId) {
      return next(new HttpError(401, "UNAUTHENTICATED", "User ID not found, Please signin first"));
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
    return next(error);
  }
});

router.post("/bio", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  let query;
  if (!req.user) {
    return next(new HttpError(401, "UNAUTHENTICATED", "Please login first"));
  }
    if (
      (req.body.user_id && Number(req.body.user_id) !== req.user.userId) ||
      (req.body.userId && Number(req.body.userId) !== req.user.userId)
    ) {
      return next(new HttpError(403, "FORBIDDEN", "Forbidden: You cannot modify another user's profile"));
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
    return next(error);
  }
});

router.get("/custom_name", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  let query;
  if (!req.user) {
    return next(new HttpError(401, "UNAUTHENTICATED", "Please login first"));
  }
  const userId = req.user.userId;
  try {
    query = `SELECT custom_name FROM user_profiles WHERE user_id = ?`;
    const [rows] = await dbPool.query(query, [userId]);
    // console.log("custom_name rows:", rows);
    const customName = (rows as RowDataPacket[])[0]?.custom_name;

    return res.status(200).json({ custom_name: customName });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/custom_name",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    let query;
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Please login first"));
    }
    if (
      (req.body.user_id && Number(req.body.user_id) !== req.user.userId) ||
      (req.body.userId && Number(req.body.userId) !== req.user.userId)
    ) {
      return next(new HttpError(403, "FORBIDDEN", "Forbidden: You cannot modify another user's profile"));
    }
    const userId = req.user.userId;
    const newCustomName = req.body.custom_name;
    try {
      query = `Insert into user_profiles (user_id, custom_name) values (?, ?) on duplicate key update custom_name = values(custom_name)`;
      const updateResult = await dbPool.query(query, [userId, newCustomName]);
      if (newCustomName) {
        await updateUserSession(req, { username: newCustomName }).catch(
          (err) => console.error("Failed to update user session with new custom_name:", err)
        );
      }
      res
        .status(200)
        .json({ message: "Profile update successfully", data: updateResult });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/contact_email",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    let query;
    try {
      //* check if userId exists
      if (!req.user?.userId) {
        return next(new HttpError(401, "UNAUTHENTICATED", "User ID not found, Please signin first"));
      }

      query = `SELECT contact_email FROM user_profiles WHERE user_id = ?`;
      const [rows] = await dbPool.query(query, [req.user?.userId]);
      console.log("rows:", rows);
      const contactEmail = (rows as RowDataPacket[])[0]?.contact_email;
      return res.status(200).json({ contactEmail: contactEmail });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/contact_email",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    let query;
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Please login first"));
    }
    if (
      (req.body.user_id && Number(req.body.user_id) !== req.user.userId) ||
      (req.body.userId && Number(req.body.userId) !== req.user.userId)
    ) {
      return next(new HttpError(403, "FORBIDDEN", "Forbidden: You cannot modify another user's profile"));
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
      return next(error);
    }
  },
);

router.get(
  "/contact_phone",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    let query;
    try {
      //* check if userId exists
      if (!req.user?.userId) {
        return next(new HttpError(401, "UNAUTHENTICATED", "User ID not found, Please signin first"));
      }

      query = `SELECT contact_phone FROM user_profiles WHERE user_id = ?`;
      const [rows] = await dbPool.query(query, [req.user?.userId]);
      console.log("rows:", rows);
      const contactPhone = (rows as RowDataPacket[])[0]?.contact_phone;
      return res.status(200).json({ contactPhone: contactPhone });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/contact_phone",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    let query;
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Please login first"));
    }
    if (
      (req.body.user_id && Number(req.body.user_id) !== req.user.userId) ||
      (req.body.userId && Number(req.body.userId) !== req.user.userId)
    ) {
      return next(new HttpError(403, "FORBIDDEN", "Forbidden: You cannot modify another user's profile"));
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
      return next(error);
    }
  },
);

export default router;
