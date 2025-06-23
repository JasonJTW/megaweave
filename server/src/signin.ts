import express from "express";
import { Request, Response, Router } from "express";
import mysql, { ResultSetHeader, RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { SigninUserSchema, SigninUserSchemaType } from "./validations";
import { handleError } from "./utils/errorHandler";
import { verifyPassword } from "./passwordHasher";
import { createUserSession, UserSession } from "./session";
import { OAuth2Client } from "google-auth-library";
const router = Router();

//* Native sign in
router.post("/", async (req: Request, res: Response) => {
  console.log("API signin called");
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  //* Implementing the signin logic
  //* 1. Validate the input
  let validationResult: SigninUserSchemaType | undefined;
  try {
    validationResult = SigninUserSchema.parse(user);
    console.log("signin validation result: ", validationResult);
  } catch (error) {
    console.log("signin validation result: ", validationResult);
    console.error("signin validation error: ", error);
    return handleError(error, res);
  }

  //* 2. Validate password
  ///1. Check if user exists in db
  if (!validationResult) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const query = "SELECT * FROM users WHERE email = ?";
  let result: RowDataPacket | undefined;
  try {
    const [row] = await dbPool.query<RowDataPacket[]>(query, [user.email]);
    result = row[0];
    console.log("result:", result);

    if (!result) {
      /// If user does not exist, return 404
      return res.status(404).json({ errorMessage: "User not found" });
    }
  } catch (error) {
    console.error("Database query error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
  /// 2. User exists, now check password

  const isCorrectPassword = await verifyPassword(
    user.password,
    result.salt,
    result.password
  );
  if (!isCorrectPassword) {
    return res.status(401).json({ errorMessage: "Invalid password" });
  }

  /// 3. If password is correct, create a session
  const validUser: UserSession = {
    username: result.username,
    email: result.email,
    role: result.role,
    userId: result.id.toString(),
    provider: result.provider,
  };
  try {
    await createUserSession(validUser, req, res);
  } catch (error) {
    console.error("Error creating user session:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
  res.status(200).json({ message: "Signin successful" });

  ///2. Check password
});

//* Google sign in
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

async function verifyGoogleCredential(credential: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });

  /// return verified payload
  return ticket.getPayload();
}

async function findUserByGoogleId(googleId: string) {
  const query = "SELECT * FROM users WHERE google_id = ?";
  const [rows] = await dbPool.query<RowDataPacket[]>(query, [googleId]);
  return rows;
}

router.post("/google", async (req: Request, res: Response) => {
  let googleUserSession: UserSession;
  console.log("API signin with Google called");
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ errorMessage: "Credential is required" });
  }
  try {
    const googleUser = await verifyGoogleCredential(credential);
    console.log("Google user:", googleUser);

    if (!googleUser || !googleUser.email) {
      return res.status(400).json({ errorMessage: "Invalid Google user" });
    }
    /// Check if google user exists in db
    const existingUser = await findUserByGoogleId(googleUser.sub);

    /// If google user does not exist, create a new google user
    console.log(" Google user rows:", existingUser);
    if (existingUser.length === 0) {
      const query =
        "INSERT INTO users (email, username, google_id, provider) VALUES (?, ?, ?, ?)";
      const values = [
        googleUser.email,
        googleUser.name,
        googleUser.sub,
        "google",
      ];
      try {
        const [result] = await dbPool.query<ResultSetHeader>(query, values);
        console.log("New Google user created:", result);
        if (result.affectedRows === 0) {
          console.error("Failed to create new Google user", result);
          return res
            .status(500)
            .json({ errorMessage: "Failed to create user" });
        }
        googleUserSession = {
          username: googleUser.name ? googleUser.name : "Google User",
          email: googleUser.email,
          role: "user", // Default role for new users
          userId: result.insertId.toString(),
          provider: "google",
        };
      } catch (error) {
        console.error("Error creating new Google user:", error);
        return res.status(500).json({ errorMessage: "Internal server error" });
      }
    }
    /// Google user existed, create a session for the google user
    else {
      const user = existingUser[0];
      googleUserSession = {
        username: user.username,
        email: user.email,
        role: user.role,
        userId: user.id.toString(),
        provider: user.provider,
      };
    }
    await createUserSession(googleUserSession, req, res);
    return res.status(200).json({ message: "Google sign in successful" });
  } catch (error) {
    console.error("Google sign in error: ", error);
  }
});

export default router;
