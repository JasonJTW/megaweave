import { Request, Response } from "express";
import { getUserFromCookie } from "./session";
import Router from "express";
const router = Router();

router.get("/", async (req: Request, res: Response) => {
  console.log("Received Request for /api/currentUser");
  // console.log("Request Headers:", req.headers);
  // console.log("Cookies:", req.cookies);
  return await getUserFromCookie(req, res);
});

export default router;
