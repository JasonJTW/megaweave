export type DeliveryStage =
  | "assigning"
  | "toPickup"
  | "inTransit"
  | "delivered"
  | "cancelled"
  | "expired"
  | "rejected";

export interface DeliveryStatusView {
  stage: DeliveryStage;
  /** Position on the 4-step tracker (1–4), or -1 when the order ended without delivery. */
  step: number;
  isCancellable: boolean;
  /** No further updates are expected, so polling can stop. */
  isFinal: boolean;
}

// Lalamove reports the same stage under several names depending on the API version and webhook
const STAGE_BY_STATUS: Record<string, DeliveryStage> = {
  ASSIGNING_DRIVER: "assigning",
  ASSIGNED: "toPickup",
  ON_GOING: "toPickup",
  PICKED_UP: "inTransit",
  IN_DELIVERY: "inTransit",
  COMPLETED: "delivered",
  FULFILLED: "delivered",
  DELIVERED: "delivered",
  FINISHED: "delivered",
  CANCELED: "cancelled",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  REJECTED: "rejected",
};

const STEP_BY_STAGE: Record<DeliveryStage, number> = {
  assigning: 1,
  toPickup: 2,
  inTransit: 3,
  delivered: 4,
  cancelled: -1,
  expired: -1,
  rejected: -1,
};

/**
 * How the delivery tracking page presents a raw Lalamove order status. An unrecognised
 * status is shown as still matching a driver, but only a known pre-pickup status may be
 * cancelled.
 */
export function deliveryStatusView(
  status: string | null | undefined,
): DeliveryStatusView {
  const known = STAGE_BY_STATUS[(status ?? "").trim().toUpperCase()];
  const stage = known ?? "assigning";
  return {
    stage,
    step: STEP_BY_STAGE[stage],
    isCancellable: known === "assigning" || known === "toPickup",
    isFinal: stage === "delivered" || STEP_BY_STAGE[stage] === -1,
  };
}
