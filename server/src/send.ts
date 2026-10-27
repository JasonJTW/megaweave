import { Router, Request, Response, NextFunction } from "express";
import z from "zod";
import type { SendEmailJobData } from "./queue/jobs/email";
import { enqueueSendEmail } from "./queue/queues";
import { requireRole } from "./middleware/auth";
import { HttpError } from "./utils/httpError";

const router = Router();

// 手動測試用：僅限 admin，避免被當成任意寄信入口
router.use(requireRole("admin"));

const SendEmailSchema = z.discriminatedUnion("template", [
  z.object({
    template: z.literal("weave-status"),
    recipientId: z.number().int().positive(),
    action: z.enum([
      "requested",
      "approved",
      "declined",
      "cancelled",
      "withdrawn",
      "confirmed",
      "completed",
    ]),
    actorName: z.string(),
    postTitle: z.string(),
    weaveId: z.number().int().positive(),
    items: z.array(
      z.object({
        title: z.string().nullable(),
        quantity: z.number().int().positive().nullable(),
      }),
    ),
    recipientRole: z.enum(["giver", "receiver"]),
    ctaUrl: z.url(),
  }),
  z.object({
    template: z.literal("delivery-notice"),
    recipientId: z.number().int().positive(),
    event: z.enum([
      "DISPATCH_FAILED",
      "PAID_AFTER_ORDER_CLOSED",
      "REFUNDED",
      "REFUND_FAILED",
    ]),
    reason: z.string().optional(),
    merchantTradeNo: z.string(),
    amount: z.number().nonnegative(),
    ctaUrl: z.url(),
  }),
]);

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = SendEmailSchema.safeParse(req.body.props);
  if (!parsed.success) {
    return next(new HttpError(400, "INVALID_REQUEST", "Invalid email job payload"));
  }
  const props: SendEmailJobData = parsed.data;

  try {
    await enqueueSendEmail(props);
    return res.status(202).json({
      message: "Email job enqueued successfully",
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
