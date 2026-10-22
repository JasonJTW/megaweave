import { Job } from "bullmq";
import { Resend } from "resend";
import type { ReactElement } from "react";
import dbPool from "../../utils/db";
import { processSendEmail, SendEmailJobData } from "./email";

jest.mock("../../utils/db");
jest.mock("resend");

// react-email's render() dynamically imports react-dom/server, which Jest's CJS runtime can't do
const { renderToStaticMarkup } = jest.requireActual("react-dom/server") as {
  renderToStaticMarkup: (element: ReactElement) => string;
};

const send = jest.fn();

function recipient(overrides: Record<string, unknown> = {}) {
  return { username: "Alice", email: "alice@example.com", locale: "zh-TW", ...overrides };
}

function mockJob(data: SendEmailJobData) {
  return {
    data,
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<SendEmailJobData>;
}

async function sentEmail() {
  expect(send).toHaveBeenCalledTimes(1);
  const { to, subject, react } = send.mock.calls[0][0];
  return { to, subject, html: renderToStaticMarkup(react) };
}

const weaveApproved: SendEmailJobData = {
  template: "weave-status",
  recipientId: 42,
  action: "approved",
  actorName: "Bob",
  postTitle: "Rice cooker",
  weaveId: 7,
  items: [{ title: "Rice cooker", quantity: 2 }],
  isRecipientGiver: false,
  ctaUrl: "https://megaweaving.net/user?highlightWeaveId=7",
};

const deliveryRefunded: SendEmailJobData = {
  template: "delivery-notice",
  recipientId: 42,
  event: "REFUNDED",
  reason: "LALAMOVE_EXPIRED",
  merchantTradeNo: "MW123",
  amount: 150,
  ctaUrl: "https://megaweaving.net/delivery/payment-result?MerchantTradeNo=MW123",
};

describe("email worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "test-resend-key";
    send.mockResolvedValue({ data: { id: "email-1" }, error: null });
    (Resend as unknown as jest.Mock).mockImplementation(() => ({ emails: { send } }));
  });

  it("sends a weave email in Chinese to a zh-TW recipient", async () => {
    (dbPool.execute as jest.Mock).mockResolvedValueOnce([[recipient()]]);

    await processSendEmail(mockJob(weaveApproved));

    const { to, subject, html } = await sentEmail();
    expect(to).toBe("alice@example.com");
    expect(subject).toBe("交織請求已同意");
    expect(html).toContain('lang="zh-TW"');
    expect(html).toContain("Bob 同意了你對「Rice cooker」的交織請求");
    expect(html).toContain("Alice 您好，");
    expect(html).toContain("收到的物品");
    expect(html).toContain("交織中");
    expect(html).toContain("查看交織 →");
  });

  it("sends a weave email in English to an en recipient", async () => {
    (dbPool.execute as jest.Mock).mockResolvedValueOnce([[recipient({ locale: "en" })]]);

    await processSendEmail(mockJob(weaveApproved));

    const { subject, html } = await sentEmail();
    expect(subject).toBe("Weave Request Approved");
    expect(html).toContain('lang="en"');
    expect(html).toContain("Bob approved your weave request for &quot;Rice cooker&quot;");
    expect(html).toContain("Hi Alice,");
    expect(html).toContain("Items received");
    expect(html).toContain("Weaving");
    expect(html).not.toMatch(/[一-鿿]/);
  });

  it("falls back to Chinese when the recipient has no locale", async () => {
    (dbPool.execute as jest.Mock).mockResolvedValueOnce([[recipient({ locale: null })]]);

    await processSendEmail(mockJob(weaveApproved));

    const { subject } = await sentEmail();
    expect(subject).toBe("交織請求已同意");
  });

  it("translates the all-items placeholder", async () => {
    (dbPool.execute as jest.Mock).mockResolvedValueOnce([[recipient({ locale: "en" })]]);

    await processSendEmail(
      mockJob({ ...weaveApproved, items: [{ title: null, quantity: null }] }),
    );

    const { html } = await sentEmail();
    expect(html).toContain("All items");
  });

  it("sends a delivery notice in the recipient's language", async () => {
    (dbPool.execute as jest.Mock)
      .mockResolvedValueOnce([[recipient()]])
      .mockResolvedValueOnce([[recipient({ locale: "en" })]]);

    await processSendEmail(mockJob(deliveryRefunded));
    const zh = await sentEmail();
    expect(zh.subject).toBe("外送款項已全額退款");
    expect(zh.html).toContain("由於沒有司機在時限內接單，外送訂單（MW123）的 NT$150 已退回原信用卡");
    expect(zh.html).toContain("訂單編號");

    send.mockClear();
    await processSendEmail(mockJob(deliveryRefunded));
    const en = await sentEmail();
    expect(en.subject).toBe("Delivery payment refunded");
    expect(en.html).toContain(
      "No driver accepted your delivery in time, so your payment of NT$150 for order MW123",
    );
    expect(en.html).toContain("Order no.");
  });

  it("skips the email when the recipient has no email address", async () => {
    (dbPool.execute as jest.Mock).mockResolvedValueOnce([[recipient({ email: null })]]);

    await processSendEmail(mockJob(weaveApproved));

    expect(send).not.toHaveBeenCalled();
  });

  it("skips jobs enqueued in the legacy pre-rendered shape", async () => {
    const legacy = { toEmail: "alice@example.com", title: "Weave Request Approved" };

    await processSendEmail(mockJob(legacy as unknown as SendEmailJobData));

    expect(dbPool.execute).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("fails the job when Resend rejects the email", async () => {
    (dbPool.execute as jest.Mock).mockResolvedValueOnce([[recipient()]]);
    send.mockResolvedValueOnce({ data: null, error: { message: "rate limited" } });

    await expect(processSendEmail(mockJob(weaveApproved))).rejects.toThrow("rate limited");
  });
});
