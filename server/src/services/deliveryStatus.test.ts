import {
  canTransition,
  lalamoveFailureReason,
  predecessorsOf,
} from "./deliveryStatus";

describe("delivery status state machine", () => {
  it.each([
    ["PAYMENT_PENDING", "ORDER_PLACING"],
    ["ORDER_PLACING", "ASSIGNING_DRIVER"],
    ["ASSIGNING_DRIVER", "ON_GOING"],
    ["ASSIGNING_DRIVER", "COMPLETED"], // missed intermediate webhooks
    ["ON_GOING", "ASSIGNING_DRIVER"], // driver rejected → re-matching
    ["PICKED_UP", "ASSIGNING_DRIVER"], // driver rejected after pickup
    ["ON_GOING", "PICKED_UP"],
    ["PICKED_UP", "COMPLETED"],
  ])("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["COMPLETED", "ON_GOING"], // late webhook after completion
    ["PICKED_UP", "ON_GOING"], // out-of-order webhook
    ["PICKED_UP", "CANCELLED"],
    ["CANCELLED", "ASSIGNING_DRIVER"],
    ["EXPIRED", "ORDER_PLACING"], // payment arrived after expiry
    ["ON_GOING", "ON_GOING"], // duplicate event
    ["ON_GOING", "UNKNOWN"],
    [null, "ON_GOING"],
  ])("rejects %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("lists predecessors for SQL guards", () => {
    expect(predecessorsOf("ORDER_PLACING")).toEqual(["PAYMENT_PENDING"]);
    expect(predecessorsOf("CANCELLED")).toEqual([
      "PAYMENT_PENDING",
      "ASSIGNING_DRIVER",
      "ON_GOING",
    ]);
    expect(predecessorsOf("COMPLETED")).toEqual([
      "ASSIGNING_DRIVER",
      "ON_GOING",
      "PICKED_UP",
    ]);
  });
});

describe("lalamoveFailureReason", () => {
  it("derives reason from the raw Lalamove status for refundable statuses", () => {
    expect(lalamoveFailureReason("FAILED", "REJECTED")).toBe("LALAMOVE_REJECTED");
    expect(lalamoveFailureReason("EXPIRED", "expired")).toBe("LALAMOVE_EXPIRED");
  });

  it("returns null for non-failure statuses", () => {
    expect(lalamoveFailureReason("COMPLETED", "COMPLETED")).toBeNull();
    expect(lalamoveFailureReason("CANCELLED", "CANCELED")).toBeNull();
  });
});
