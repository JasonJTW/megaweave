import dbPool from "../utils/db";
import { createNotification } from "../utils/notificationService";
import { enqueueSendEmail } from "../queue/queues";
import { notifyDeliveryUser } from "./deliveryNotifier";
import { getDeliveryNoticeCopy } from "./deliveryNoticeCopy";

jest.mock("../utils/db", () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock("../utils/socket", () => ({ getSocketBroadcaster: () => null }));
jest.mock("../utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock("../queue/queues", () => ({ enqueueSendEmail: jest.fn().mockResolvedValue(undefined) }));

const query = dbPool.query as jest.Mock;

const target = (overrides: Record<string, unknown> = {}) => ({
  user_id: 42,
  merchant_trade_no: "MW123",
  amount: 150,
  email: "alice@example.com",
  locale: "zh-TW",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("getDeliveryNoticeCopy", () => {
  it("tells the user a failed booking will be refunded (zh-TW)", () => {
    const copy = getDeliveryNoticeCopy("DISPATCH_FAILED", "zh-TW", { tradeNo: "MW123", amount: 150 });
    expect(copy.title).toBe("叫車失敗，將全額退款");
    expect(copy.content).toContain("NT$150");
    expect(copy.content).toContain("MW123");
  });

  it("adds the Lalamove reason to the refund notice", () => {
    expect(
      getDeliveryNoticeCopy("REFUNDED", "zh-TW", { tradeNo: "MW1", amount: 1, reason: "LALAMOVE_EXPIRED" })
        .content,
    ).toMatch(/^由於沒有司機在時限內接單/);
    expect(
      getDeliveryNoticeCopy("REFUNDED", "en", { tradeNo: "MW1", amount: 1, reason: "LALAMOVE_EXPIRED" })
        .content,
    ).toMatch(/^No driver accepted your delivery in time, so your payment/);
    expect(getDeliveryNoticeCopy("REFUNDED", "en", { tradeNo: "MW1", amount: 1 }).content).toMatch(
      /^Your payment of NT\$1/,
    );
  });
});

describe("notifyDeliveryUser", () => {
  it("sends a localized in-app notification and an email job linking to the result page", async () => {
    query.mockResolvedValueOnce([[target({ locale: "en" })]]);

    await notifyDeliveryUser(7, "DISPATCH_FAILED");

    expect(createNotification).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        recipient_id: 42,
        type: "ORDER_UPDATE",
        title: "Delivery booking failed — full refund on the way",
        link: "/delivery/payment-result?MerchantTradeNo=MW123",
      }),
    );
    expect(enqueueSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "delivery-notice",
        recipientId: 42,
        event: "DISPATCH_FAILED",
        merchantTradeNo: "MW123",
        amount: 150,
      }),
    );
  });

  it("still emails when the in-app notification fails", async () => {
    query.mockResolvedValueOnce([[target()]]);
    (createNotification as jest.Mock).mockRejectedValueOnce(new Error("db"));

    await notifyDeliveryUser(7, "REFUNDED");

    expect(enqueueSendEmail).toHaveBeenCalled();
  });

  it("never throws (best effort)", async () => {
    query.mockRejectedValueOnce(new Error("DB down"));
    await expect(notifyDeliveryUser(7, "REFUND_FAILED")).resolves.toBeUndefined();
  });
});
