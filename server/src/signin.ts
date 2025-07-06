//* signin.ts

import express from "express";
import { Request, Response, Router } from "express";
import mysql, { ResultSetHeader, RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { SigninUserSchema, SigninUserSchemaType } from "./validations";
import { handleError } from "./utils/errorHandler";
import { verifyPassword } from "./passwordHasher";
import { createUserSession } from "./session";
import { UserSession } from "./schema";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
dotenv.config();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const router = Router();

/// env check
if (!GOOGLE_CLIENT_ID) {
  throw new Error("Missing required environment variable: GOOGLE_CLIENT_ID");
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
  }
): Promise<RowDataPacket> {
  // 1. 先查找是否已存在相同 email 的用戶
  const findQuery = "SELECT * FROM users WHERE email = ?";
  const [existingUsers] = await dbPool.query<RowDataPacket[]>(findQuery, [
    email,
  ]);

  if (existingUsers.length > 0) {
    const existingUser = existingUsers[0];

    // 2. 用戶已存在，更新 provider 信息
    let providers: string[] = [];

    // 解析現有的 providers (現在是 JSON 格式)
    if (existingUser.providers) {
      try {
        providers = JSON.parse(existingUser.providers);
        // 確保是陣列格式
        if (!Array.isArray(providers)) {
          providers = [];
        }
      } catch (error) {
        console.error("Error parsing providers JSON:", error);
        providers = [];
      }
    }

    // 添加新的 provider（如果還沒有）
    if (!providers.includes(provider)) {
      providers.push(provider);
    }

    // 3. 更新用戶資料
    let updateQuery = "UPDATE users SET providers = ?";
    let updateValues: any[] = [JSON.stringify(providers)];

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
      updateValues.push(providerData.password, providerData.salt);
    }

    updateQuery += " WHERE email = ?";
    updateValues.push(email);

    await dbPool.query(updateQuery, updateValues);

    // 返回更新後的用戶資料
    const [updatedUsers] = await dbPool.query<RowDataPacket[]>(findQuery, [
      email,
    ]);
    return updatedUsers[0];
  } else {
    // 4. 用戶不存在，創建新用戶
    const insertQuery = `
      INSERT INTO users (email, username, password, salt, google_id, facebook_id, providers, role) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      email,
      providerData.username || email.split("@")[0], // 默認用戶名
      providerData.password || null,
      providerData.salt || null,
      providerData.googleId || null,
      providerData.facebookId || null,
      JSON.stringify([provider]),
      "user", // 默認角色
    ];

    const [result] = await dbPool.query<ResultSetHeader>(
      insertQuery,
      insertValues
    );

    // 返回新創建的用戶
    const [newUsers] = await dbPool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );
    return newUsers[0];
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
    const query = "SELECT * FROM users WHERE email = ?";
    const [rows] = await dbPool.query<RowDataPacket[]>(query, [user.email]);

    if (rows.length === 0) {
      return res.status(404).json({ errorMessage: "User not found" });
    }

    const foundUser = rows[0];

    // 3. 檢查用戶是否支持 native 登入
    let userProviders: string[] = [];
    if (foundUser.providers) {
      try {
        userProviders = JSON.parse(foundUser.providers);
        if (!Array.isArray(userProviders)) {
          userProviders = [];
        }
      } catch (error) {
        console.error("Error parsing user providers:", error);
        userProviders = [];
      }
    }

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
      foundUser.password
    );

    if (!isCorrectPassword) {
      return res.status(401).json({ errorMessage: "Invalid password" });
    }

    // 5. 創建 session
    const validUser: UserSession = {
      username: foundUser.username,
      email: foundUser.email,
      role: foundUser.role,
      userId: foundUser.id.toString(),
      provider: "native",
    };

    await createUserSession(validUser, req, res);
    res.status(200).json({ message: "Signin successful" });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// Google sign in

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
    throw new Error("Invalid Google credential");
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
      userId: user.id.toString(),
      provider: "google",
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
  accessToken: string
): Promise<FacebookUser | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email,picture`
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
      userId: user.id.toString(),
      provider: "facebook",
    };

    await createUserSession(facebookUserSession, req, res);
    return res.status(200).json({ message: "Facebook sign in successful" });
  } catch (error) {
    console.error("Facebook sign in error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
