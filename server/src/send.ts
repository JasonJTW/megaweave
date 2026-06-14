import { Router, Request, Response } from "express";
import { Resend } from "resend";

const router = Router();

const resend = new Resend(process.env.RESEND_API_KEY);

router.get("/", async (req: Request, res: Response) => {
  const { data, error } = await resend.emails.send({
    from: "Acme <onboarding@resend.dev>",
    to: ["delivered@resend.dev"],
    subject: "hello world",
    html: "<strong>it works!</strong>",
  });

  if (error) {
    return res.status(400).json({ error });
  }

  res.status(200).json({ data });
});
