//* signin.ts

import { Request, Response, Router } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { SigninUserSchema, SigninUserSchemaType } from "./validations";
import { handleError } from "./utils/errorHandler";
import { verifyPassword } from "./passwordHasher";
import { createUserSession } from "./session";
import { UserSession } from "./schema";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
import { userRoles } from "./schema";
import { randomUUID } from "crypto";
dotenv.config();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const router = Router();

/// env check
if (!GOOGLE_CLIENT_ID) {
  throw new Error("Missing required environment variable: GOOGLE_CLIENT_ID");
}

function parseProviders(providersData: unknown): string[] {
  // 如果是 null 或 undefined，返回空陣列
  if (!providersData) {
    return [];
  }

  // 如果已經是陣列，直接返回
  if (Array.isArray(providersData)) {
    return providersData;
  }

  // 如果是字串，嘗試解析
  if (typeof providersData === "string") {
    try {
      const parsed = JSON.parse(providersData);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Error parsing providers JSON:", error);
      return [];
    }
  }

  // 其他情況返回空陣列
  console.warn("Unexpected providers data type:", typeof providersData);
  return [];
}

// 統一的用戶查找和更新函數
async function findOrCreateUser(
  email: string,
  provider: "native" | "google" | "facebook",
  providerData: {
    username?: string;
    googleId?: string;
    facebookId?: string;
    password?: string;
    salt?: string;
  },
): Promise<RowDataPacket> {
  // 1. 先查找是否已存在相同 email 的用戶
  const findQuery = `
    SELECT u.*, up.custom_name 
    FROM users u 
    LEFT JOIN user_profiles up ON u.id = up.user_id 
    WHERE u.email = ?
  `;
  const [existingUsers] = await dbPool.execute<RowDataPacket[]>(findQuery, [
    email,
  ]);

  if (existingUsers.length > 0) {
    const existingUser = existingUsers[0];
    const [existingProfiles] = await dbPool.execute<RowDataPacket[]>(
      "SELECT * FROM user_profiles WHERE user_id = ?",
      [existingUser.id],
    );

    // 如果沒有 profile，創建一個
    if (existingProfiles.length === 0) {
      const insertProfileQuery = `
      INSERT INTO user_profiles (user_id, contact_email, custom_name) 
      VALUES (?, ?, ?)
    `;
      await dbPool.execute(insertProfileQuery, [
        existingUser.id,
        email,
        existingUser.username || email.split("@")[0],
      ]);
    }
    // 2. 用戶已存在，更新 provider 信息
    const providers: string[] = parseProviders(existingUser.providers);

    // 添加新的 provider（如果還沒有）
    if (!providers.includes(provider)) {
      providers.push(provider);
    }

    // 3. 更新用戶資料
    let updateQuery = "UPDATE users SET providers = ?";
    const updateValues: (string | null)[] = [JSON.stringify(providers)];

    // 根據 provider 類型更新相應字段
    if (
      provider === "google" &&
      providerData.googleId &&
      !existingUser.google_id
    ) {
      updateQuery += ", google_id = ?";
      updateValues.push(providerData.googleId);
    } else if (
      provider === "facebook" &&
      providerData.facebookId &&
      !existingUser.facebook_id
    ) {
      updateQuery += ", facebook_id = ?";
      updateValues.push(providerData.facebookId);
    } else if (
      provider === "native" &&
      providerData.password &&
      !existingUser.password
    ) {
      updateQuery += ", password = ?, salt = ?";
      updateValues.push(providerData.password, providerData.salt ?? null);
    }

    updateQuery += " WHERE email = ?";
    updateValues.push(email);

    await dbPool.execute(updateQuery, updateValues);

    // 返回更新後的用戶資料
    const [updatedUsers] = await dbPool.execute<RowDataPacket[]>(findQuery, [
      email,
    ]);
    if (updatedUsers.length === 0) {
      throw new Error("User not found after update");
    }
    const retUser = updatedUsers[0];
    if (retUser.custom_name && retUser.custom_name.trim()) {
      retUser.username = retUser.custom_name.trim();
    }
    return retUser;
  } else {
    // 4. 用戶不存在，創建新用戶
    const insertUsersQuery = `
      INSERT INTO users (email, username, password, salt, google_id, facebook_id, providers, role, public_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const public_id = randomUUID();

    const insertUsersValues = [
      email,
      providerData.username || email.split("@")[0], // 默認用戶名
      providerData.password || null,
      providerData.salt || null,
      providerData.googleId || null,
      providerData.facebookId || null,
      JSON.stringify([provider]),
      userRoles[0], // default role is 'user'
      public_id,
    ];

    const insertProfileQuery = `INSERT INTO user_profiles (user_id, contact_email, custom_name) VALUES (?, ?, ?)`;
    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();
      const userResult = await connection.execute<ResultSetHeader>(
        insertUsersQuery,
        insertUsersValues,
      );
      const userId = (userResult[0] as ResultSetHeader).insertId;
      const insertProfileValues = [
        userId,
        email,
        providerData.username || email.split("@")[0],
      ];
      await connection.execute<ResultSetHeader>(
        insertProfileQuery,
        insertProfileValues,
      );
      // 返回新創建的用戶
      const [newUsers] = await connection.execute<RowDataPacket[]>(
        `SELECT u.*, up.custom_name 
         FROM users u 
         LEFT JOIN user_profiles up ON u.id = up.user_id 
         WHERE u.id = ?`,
        [userId],
      );
      await connection.commit();
      const retUser = newUsers[0];
      if (retUser.custom_name && retUser.custom_name.trim()) {
        retUser.username = retUser.custom_name.trim();
      }
      return retUser;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

// Native sign in
router.post("/", async (req: Request, res: Response) => {
  console.log("API signin called");
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  // 1. 驗證輸入
  let validationResult: SigninUserSchemaType | undefined;
  try {
    validationResult = SigninUserSchema.parse(user);
  } catch (error) {
    console.error("signin validation error: ", error);
    return handleError(error, res);
  }

  if (!validationResult) {
    return res.status(400).json({ errorMessage: "Invalid input" });
  }

  try {
    // 2. 查找用戶
    const query = `
      SELECT u.*, up.custom_name 
      FROM users u 
      LEFT JOIN user_profiles up ON u.id = up.user_id 
      WHERE u.email = ?
    `;
    const [rows] = await dbPool.execute<RowDataPacket[]>(query, [user.email]);

    if (rows.length === 0) {
      return res.status(404).json({ errorMessage: "User not found" });
    }

    const foundUser = rows[0];
    console.log("foundUser:", foundUser);
    // 3. 檢查用戶是否支持 native 登入
    const userProviders: string[] = parseProviders(foundUser.providers);
    // 檢查是否支持 native 登入
    if (
      !userProviders.includes("native") &&
      (!foundUser.password || !foundUser.salt)
    ) {
      // 取得用戶支持的登入方式
      const availableProviders = userProviders.filter((p) => p !== "native");
      const providerText =
        availableProviders.length > 0
          ? availableProviders.join(" or ")
          : "social login";

      return res.status(400).json({
        errorMessage: `This email is registered with ${providerText}. Please use ${providerText} to sign in.`,
      });
    }

    // 4. 驗證密碼
    const isCorrectPassword = await verifyPassword(
      user.password,
      foundUser.salt,
      foundUser.password,
    );

    if (!isCorrectPassword) {
      return res.status(401).json({ errorMessage: "Invalid password" });
    }

    // 5. 創建 session
    const validUser: UserSession = {
      username:
        (foundUser.custom_name && foundUser.custom_name.trim()) ||
        foundUser.username,
      email: foundUser.email,
      role: foundUser.role,
      userId: Number(foundUser.id),
      provider: "native",
      avatar_url: foundUser.avatar_url || null,
      avatar_key: foundUser.avatar_key || null,
      public_id: foundUser.public_id,
      joined_at: foundUser.created_at,
    };

    await createUserSession(validUser, req, res);
    res.status(200).json({ message: "Signin successful" });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

//* Google sign in

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

async function verifyGoogleCredential(credential: string) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  } catch (error) {
    console.error("Google credential verification failed:", error);
    const wrappedError = new Error("Invalid Google credential");
    (wrappedError as Error & { cause?: unknown }).cause = error;
    throw wrappedError;
  }
}

router.post("/google", async (req: Request, res: Response) => {
  console.log("API signin with Google called");
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ errorMessage: "Credential is required" });
  }

  try {
    const googleUser = await verifyGoogleCredential(credential);

    if (!googleUser || !googleUser.email) {
      return res.status(400).json({ errorMessage: "Invalid Google user" });
    }

    // 檢查必要的 Google 用戶資料
    if (!googleUser.sub) {
      return res.status(400).json({ errorMessage: "Invalid Google user ID" });
    }

    // 使用統一函數處理用戶
    const user = await findOrCreateUser(googleUser.email, "google", {
      username: googleUser.name,
      googleId: googleUser.sub,
    });

    const googleUserSession: UserSession = {
      username: user.username,
      email: user.email,
      role: user.role,
      userId: user.id,
      provider: "google",
      avatar_url: user.avatar_url ?? null,
      avatar_key: user.avatar_key ?? null,
      public_id: user.public_id,
      joined_at: user.created_at,
    };

    await createUserSession(googleUserSession, req, res);
    return res.status(200).json({ message: "Google sign in successful" });
  } catch (error) {
    console.error("Google sign in error: ", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// Facebook sign in
interface FacebookUser {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

async function verifyFacebookToken(
  accessToken: string,
): Promise<FacebookUser | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email,picture.width(800).height(800)`,
    );

    if (!response.ok) {
      console.error("Facebook API response not OK:", response.status);
      return null;
    }

    const userData = await response.json();

    if (userData.error) {
      console.error("Facebook API error:", userData.error);
      return null;
    }

    return userData;
  } catch (error) {
    console.error("Error verifying Facebook token:", error);
    return null;
  }
}

router.post("/facebook", async (req: Request, res: Response) => {
  console.log("API signin with Facebook called");
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ errorMessage: "Access token is required" });
  }

  try {
    const facebookUser = await verifyFacebookToken(accessToken);
    console.log("facebookUser:", facebookUser);

    if (!facebookUser || !facebookUser.email) {
      return res.status(401).json({
        errorMessage: "Invalid Facebook token or email not provided",
      });
    }

    // 檢查必要的 Facebook 用戶資料
    if (!facebookUser.id) {
      return res.status(400).json({ errorMessage: "Invalid Facebook user ID" });
    }

    // 使用統一函數處理用戶
    const user = await findOrCreateUser(facebookUser.email, "facebook", {
      username: facebookUser.name,
      facebookId: facebookUser.id,
    });

    const facebookUserSession: UserSession = {
      username: user.username,
      email: user.email,
      role: user.role,
      userId: Number(user.id),
      provider: "facebook",
      avatar_url: user.avatar_url || null,
      avatar_key: user.avatar_key || null,
      public_id: user.public_id,
      joined_at: user.created_at,
    };

    await createUserSession(facebookUserSession, req, res);
    return res.status(200).json({ message: "Facebook sign in successful" });
  } catch (error) {
    console.error("Facebook sign in error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
