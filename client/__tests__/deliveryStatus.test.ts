import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deliveryStatusView } from "@/utils/deliveryStatus";

describe("deliveryStatusView", () => {
  it("maps a driver being matched to the first stage", () => {
    assert.deepEqual(deliveryStatusView("ASSIGNING_DRIVER"), {
      stage: "assigning",
      step: 1,
      isCancellable: true,
      isFinal: false,
    });
  });

  it("treats an accepted order as heading to pickup, still cancellable", () => {
    for (const status of ["ASSIGNED", "ON_GOING"]) {
      assert.deepEqual(deliveryStatusView(status), {
        stage: "toPickup",
        step: 2,
        isCancellable: true,
        isFinal: false,
      });
    }
  });

  it("treats a picked-up order as in transit and no longer cancellable", () => {
    for (const status of ["PICKED_UP", "IN_DELIVERY"]) {
      assert.deepEqual(deliveryStatusView(status), {
        stage: "inTransit",
        step: 3,
        isCancellable: false,
        isFinal: false,
      });
    }
  });

  it("normalizes case and whitespace from webhooks", () => {
    assert.equal(deliveryStatusView("  picked_up ").stage, "inTransit");
  });

  it("treats every completion status Lalamove sends as delivered and final", () => {
    for (const status of ["COMPLETED", "FULFILLED", "DELIVERED", "FINISHED"]) {
      assert.deepEqual(deliveryStatusView(status), {
        stage: "delivered",
        step: 4,
        isCancellable: false,
        isFinal: true,
      });
    }
  });

  it("ends the stepper for cancelled, expired and rejected orders", () => {
    const cases = [
      ["CANCELED", "cancelled"],
      ["CANCELLED", "cancelled"],
      ["EXPIRED", "expired"],
      ["REJECTED", "rejected"],
    ] as const;
    for (const [status, stage] of cases) {
      assert.deepEqual(deliveryStatusView(status), {
        stage,
        step: -1,
        isCancellable: false,
        isFinal: true,
      });
    }
  });

  it("shows an unknown or missing status as still matching a driver, but not cancellable", () => {
    for (const status of ["SOMETHING_NEW", "", undefined, null]) {
      assert.deepEqual(deliveryStatusView(status), {
        stage: "assigning",
        step: 1,
        isCancellable: false,
        isFinal: false,
      });
    }
  });
});
