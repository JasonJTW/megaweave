import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLalamoveAction,
  shouldShowLalamoveQuotation,
} from "@/utils/weaveGuard";

describe("getLalamoveAction", () => {
  it("returns 'recalculate' when isQuoteExpired is true, regardless of weave status", () => {
    const actionWithPending = getLalamoveAction({
      isQuoteExpired: true,
      hasPendingWeave: true,
    });
    assert.equal(actionWithPending, "recalculate");

    const actionWithoutPending = getLalamoveAction({
      isQuoteExpired: true,
      hasPendingWeave: false,
    });
    assert.equal(actionWithoutPending, "recalculate");
  });

  it("returns 'book' when quote is valid and hasPendingWeave is true", () => {
    const action = getLalamoveAction({
      isQuoteExpired: false,
      hasPendingWeave: true,
    });
    assert.equal(action, "book");
  });

  it("returns 'weave_this' when quote is valid and hasPendingWeave is false", () => {
    const action = getLalamoveAction({
      isQuoteExpired: false,
      hasPendingWeave: false,
    });
    assert.equal(action, "weave_this");
  });
});

describe("shouldShowLalamoveQuotation", () => {
  it("returns true only when in chat window, status is pending, and post exists", () => {
    assert.equal(
      shouldShowLalamoveQuotation({
        isInChatWindow: true,
        status: "pending",
        hasPost: true,
      }),
      true,
    );
  });

  it("returns false when not in chat window even if status is pending", () => {
    assert.equal(
      shouldShowLalamoveQuotation({
        isInChatWindow: false,
        status: "pending",
        hasPost: true,
      }),
      false,
    );
  });

  it("returns false when status is not pending", () => {
    assert.equal(
      shouldShowLalamoveQuotation({
        isInChatWindow: true,
        status: "requested",
        hasPost: true,
      }),
      false,
    );
    assert.equal(
      shouldShowLalamoveQuotation({
        isInChatWindow: true,
        status: "completed",
        hasPost: true,
      }),
      false,
    );
    assert.equal(
      shouldShowLalamoveQuotation({
        isInChatWindow: true,
        status: "cancelled",
        hasPost: true,
      }),
      false,
    );
  });

  it("returns false when post is not available", () => {
    assert.equal(
      shouldShowLalamoveQuotation({
        isInChatWindow: true,
        status: "pending",
        hasPost: false,
      }),
      false,
    );
  });
});
