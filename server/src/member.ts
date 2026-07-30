import dbPool from "./utils/db";
import { RowDataPacket } from "mysql2";
import Router, { Request, Response } from "express";
import dotenv from "dotenv";
import { requireAuth, requireRole } from "./middleware/auth";
import { userRoles } from "./schema";

dotenv.config();

const router = Router();

export interface Experience {
  position: string;
  company: string;
  description: string;
  year: string;
}

export interface Website {
  url: string;
  type?: string;
}

export interface TeamMember {
  index: number;
  user_id: number;
  member_name: string;
  avatar_url: string;
  user_role: string;
  location?: string;
  title?: string;
  member_bio?: string;
  websites?: Website[];
  email?: string;
  experience?: Experience[];
  skills?: string[];
}
//RWD userProfile for contributor, displaying on about page

router.get(`/all`, async (req: Request, res: Response) => {
  const { userId } = req.query;

  let query: string;
  let queryParams: (string | number)[] = [];

  if (userId) {
    query = `SELECT * FROM members WHERE user_id = ?`;
    queryParams = [userId as string];
  } else {
    query = `SELECT * FROM members`;
  }

  try {
    const [row] = await dbPool.query<RowDataPacket[]>(query, queryParams);
    // console.log(
    //   userId ? `Member data for userId ${userId}: ` : "All members data: ",
    //   row
    // );
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
    const userId = req.user!.userId;
    const { updates } = req.body;
    const allowedFields = [
      "member_name",
      "location",
      "email",
      "member_bio",
      "websites",
      "title",
    ];

    const filteredUpdates: Partial<TeamMember> = Object.keys(updates)
      .filter((key): key is keyof TeamMember => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as Partial<TeamMember>);
    console.log(filteredUpdates);

    if (Object.keys(filteredUpdates).length === 0) {
      return res
        .status(400)
        .json({ errorMessage: "No valid fields to update" });
    }

    //TODO: check member_name
    if (
      "member_name" in filteredUpdates &&
      !filteredUpdates.member_name?.trim()
    ) {
      return res.status(400).json({
        errorMessage: "Member name is required",
      });
    }

    /// Construct SQL query
    const setClause = Object.keys(filteredUpdates)
      .map((key) => `${key} = ?`)
      .join(", ");

    const values = [...Object.values(filteredUpdates), userId];

    try {
      const query = `
      UPDATE members SET ${setClause} WHERE user_id = ?
    `;

      const [result] = await dbPool.query(query, values);

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
