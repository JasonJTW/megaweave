// server/src/queue/jobs/deliveryDispatchCheck.ts
// Processor：付款後延遲檢查單筆外送單的派單 saga（重新派單 / 等待 webhook / 判定失敗退款）

import { Job } from "bullmq";
import type { PaymentService, PlacingCheckResult } from "../../services/payment/paymentService";
import { createPaymentService } from "../../services/payment/defaultPaymentService";
import type { DeliveryDispatchCheckJobData } from "../queues";

let paymentService: PaymentService | null = null;
function getPaymentService(): PaymentService {
  paymentService ??= createPaymentService();
  return paymentService;
}

export async function processDeliveryDispatchCheck(
  job: Job<DeliveryDispatchCheckJobData>,
  service: PaymentService = getPaymentService(),
): Promise<{ result: PlacingCheckResult }> {
  const result = await service.checkPlacingOrder(job.data.deliveryOrderId);
  await job.log(`delivery_order #${job.data.deliveryOrderId}: ${result}`);
  return { result };
}
