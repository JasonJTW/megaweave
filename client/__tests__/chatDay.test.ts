import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatDayLabel } from "@/utils/chatDay";

// Local-time constructors, since day boundaries follow the reader's clock
const NOW = new Date(2026, 9, 14, 9, 30);

describe("chatDayLabel", () => {
  it("labels a message from earlier today as today", () => {
    assert.equal(chatDayLabel(new Date(2026, 9, 14, 0, 5), NOW), "today");
  });

  it("labels the previous calendar day as yesterday, even late at night", () => {
    assert.equal(chatDayLabel(new Date(2026, 9, 13, 23, 59), NOW), "yesterday");
    assert.equal(chatDayLabel(new Date(2026, 9, 13, 0, 0), NOW), "yesterday");
  });

  it("labels anything older with its date", () => {
    assert.equal(chatDayLabel(new Date(2026, 9, 12, 23, 59), NOW), "date");
    assert.equal(chatDayLabel(new Date(2025, 9, 14, 9, 30), NOW), "date");
  });

  it("handles yesterday across a month boundary", () => {
    const firstOfMonth = new Date(2026, 10, 1, 8, 0);
    assert.equal(
      chatDayLabel(new Date(2026, 9, 31, 22, 0), firstOfMonth),
      "yesterday",
    );
  });
});
