import { Router, Request, Response } from "express";
import { jsx } from "react/jsx-runtime";
import { Resend } from "resend";
import EmailTemplate, { EmailTemplateProps } from "./emails/EmailTemplate";

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

router.get("/", async (req: Request, res: Response) => {
  const props: EmailTemplateProps = {
    username: "翻翻",
    title: "Your order has been confirmed ✓",
    description:
      "your item exchange request has been accepted. The other party has confirmed the trade — here's a summary of your transaction.",
    orderId: "#TXN-20240614",
    itemOffered: "COOOOPPER🐶",
    itemReceived: "COOOOPPER🐶",
    ctaUrl: "https://megaweaving.net/transactions/TXN-20240614",
    toEmail: "pocobosque@gmail.com",
  };

  const { data, error } = await resend.emails.send({
    from: "JasonJTW <no-reply@notification.megaweaving.net>",
    to: ["pocobosque@gmail.com"],
    subject: props.title,
    react: jsx(EmailTemplate, props),
  });

  if (error) {
    return res.status(400).json({ error });
  }

  res.status(200).json({ data });
});

export default router;
