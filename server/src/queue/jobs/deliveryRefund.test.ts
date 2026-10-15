import { Job } from "bullmq";
import dbPool from "../../utils/db";
import { createNotification } from "../../utils/notificationService";
import type { PaymentService } from "../../services/payment/paymentService";
import { processDeliveryRefund, DeliveryRefundJobData } from "./deliveryRefund";

jest.mock("../../utils/db", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock("../../utils/socket", () => ({ getSocketIO: () => null }));
jest.mock("../../utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../services/payment/defaultPaymentService", () => ({
  createPaymentService: jest.fn(),
}));

const query = dbPool.query as jest.Mock;
const refund = jest.fn();
const service = { refund } as unknown as PaymentService;

function job(reason = "LALAMOVE_REJECTED") {
  return {
    data: { deliveryOrderId: 7, reason },
    log: jest.fn(),
  } as unknown as Job<DeliveryRefundJobData>;
}

function target(status: string, payment_status: string) {
  query.mockResolvedValueOnce([
    [{ user_id: 42, status, payment_id: 101, payment_status }],
  ]);
}

beforeEach(() => jest.clearAllMocks());

describe("processDeliveryRefund", () => {
  it("refunds a PAID payment of a Lalamove-terminated order and notifies the user", async () => {
    target("FAILED", "PAID");
    refund.mockResolvedValue(true);

    await expect(processDeliveryRefund(job(), service)).resolves.toEqual({ refunded: true });
    expect(refund).toHaveBeenCalledWith(101, "AUTO_REFUND: LALAMOVE_REJECTED");
    expect(createNotification).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ recipient_id: 42, type: "ORDER_UPDATE" }),
    );
  });

  it.each([
    ["FAILED", "REFUNDED"], // already refunded (retry / duplicate)
    ["FAILED", "PARTIAL_REFUNDED"], // needs manual handling
    ["COMPLETED", "PAID"], // order no longer terminal-failed
  ])("skips when delivery=%s payment=%s", async (status, paymentStatus) => {
    target(status, paymentStatus);
    await expect(processDeliveryRefund(job(), service)).resolves.toEqual({ refunded: false });
    expect(refund).not.toHaveBeenCalled();
  });

  it("throws so BullMQ retries when the provider rejects the refund", async () => {
    target("EXPIRED", "PAID");
    refund.mockResolvedValue(false);
    await expect(processDeliveryRefund(job("LALAMOVE_EXPIRED"), service)).rejects.toThrow(
      /Refund rejected/,
    );
    expect(createNotification).not.toHaveBeenCalled();
  });
});
