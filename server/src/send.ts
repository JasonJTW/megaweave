import { Router, Request, Response } from "express";
import { EmailTemplateProps } from "./emails/EmailTemplate";
import { enqueueSendEmail } from "./queue/queues";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  // const props: EmailTemplateProps = {
  //   username: "Jason",
  //   title: "Your order has been confirmed ✓",
  //   description:
  //     "your item exchange request has been accepted. The other party has confirmed the trade — here's a summary of your transaction.",
  //   //todo: Public WeaveId?
  //   weaveId: "#TXN-20240614",
  //   weaving_status: "pending",
  //   itemOffered: "A new job🐶",
  //   itemReceived: "A new job",
  //   ctaUrl: "https://megaweaving.net/transactions/TXN-20240614",
  //   toEmail: "way6107715@gmail.com",
  // };

  const props: EmailTemplateProps = req.body.props;

  try {
    await enqueueSendEmail(props);
    return res.status(202).json({
      message: "Email job enqueued successfully",
    });
  } catch (error) {
    console.error("Failed to enqueue email job: ", error);
    return res
      .status(500)
      .json({ errorMessage: "Failed to enqueue email job." });
  }
});

export default router;
