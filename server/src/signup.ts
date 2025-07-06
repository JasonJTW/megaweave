//* signup.ts
import express, { Request, Response, Router } from "express";
import dotenv from "dotenv";
dotenv.config();
import { User } from "./types/user";
import { userRoles, UserSession } from "./schema";
import {
  UserSchema,
  SignupUserSchema,
  UpdateUserSchema,
  SignupUserSchemaType,
} from "./validations";
import { z } from "zod";
import { hashPassword, generateSalt } from "./passwordHasher";
import { handleError } from "./utils/errorHandler";

const router: Router = express.Router();
import mysql, { OkPacketParams, ResultSetHeader, RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { createUserSession } from "./session";
import cookieParser from "cookie-parser";

router.post("/", async (req: Request, res: Response) => {
  console.log("API signup called");

  //* 1. Validate the input
  const user: User = {
    id: 0,
    username: req.body.username,
    email: req.body.email,
    password: req.body.password,
    salt: "",
  };
  console.log(`User:`, user);
  let validationResult: SignupUserSchemaType | undefined;
  try {
    validationResult = SignupUserSchema.parse(user);
    console.log("Validation result:", validationResult);
  } catch (error) {
    console.log(`Validation result:`, validationResult);
    console.error(`Validation error:`, error);
    return handleError(error, res);
  }

  //* 2. Check if the user already exists
  let userExisted: Boolean;
  let result: RowDataPacket | RowDataPacket[] | undefined;
  try {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE email = ?",
      [req.body.email]
    );
    result = rows[0];
    console.log(`Check user exists result:`, result);

    /// user existed logic
    if (result) {
      userExisted = true;
      console.log(`User already exists`);
      return res.status(400).json({ errorMessage: "User already exists" });
    }

    userExisted = false;
  } catch (error) {
    console.error(`Error checking if user exists: `, error);
    console.log(`result`, result);
    return handleError(error, res);
  }
  console.log(`userExisted:`, userExisted);

  //* 3. Hash the password
  const salt = generateSalt();
  const hashedPassword = await hashPassword(user.password, salt);
  console.log("hashedPassword:", hashedPassword);
  console.log("salt:", salt);
  user.password = hashedPassword;
  user.salt = salt;

  console.log("user after hashing password:", user);
  //* 4. Insert the user into the database
  try {
    const query = `INSERT INTO users (username, email, password, salt, providers, role) VALUES (?, ?, ?, ?, ?, ?)`;
    const [result] = await dbPool.query<ResultSetHeader>(query, [
      user.username,
      user.email,
      user.password,
      user.salt,
      JSON.stringify(["native"]),
      userRoles[1], // default role is 'user'
    ]);
    console.log("Insert user result:", result);

    //* 5. create user session
    const userSession: UserSession = {
      userId: result.insertId.toString(),
      role: userRoles[1],
      username: user.username,
      email: user.email,
    };
    await createUserSession(userSession, req, res);
    console.log("User session created:", userSession);
    console.log("---------");
    /// remove sensitive data before sending response
    const { password, salt, ...safeUser } = user;
    res.status(200).json({
      message: "Signup successful!",
      user: safeUser,
    });
  } catch (error) {
    return handleError(error, res);
  }
});

export default router;
