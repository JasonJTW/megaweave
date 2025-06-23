import { Request, Response, Router } from "express";
import { removeUserSession } from "./session";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  await removeUserSession(req, res);
});

export default router;
