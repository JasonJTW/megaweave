import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commentTimeDisplay } from "../utils/commentTime";

const NOW = new Date("2026-03-10T12:00:00Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

describe("commentTimeDisplay", () => {
  it("shows a relative time for anything under a week old", () => {
    assert.deepEqual(commentTimeDisplay(minutesAgo(5), NOW), {
      kind: "relative",
      value: new Date(minutesAgo(5)),
    });
    assert.equal(commentTimeDisplay(daysAgo(6), NOW)?.kind, "relative");
  });

  it("shows an absolute date from a week old onwards", () => {
    assert.deepEqual(commentTimeDisplay(daysAgo(7), NOW), {
      kind: "absolute",
      value: new Date(daysAgo(7)),
    });
    assert.equal(commentTimeDisplay(daysAgo(400), NOW)?.kind, "absolute");
  });

  it("clamps timestamps from the future to now, so no comment reads 'in 3 minutes'", () => {
    assert.deepEqual(commentTimeDisplay(minutesAgo(-5), NOW), {
      kind: "relative",
      value: NOW,
    });
  });

  it("returns null for timestamps it cannot parse, so callers can render nothing", () => {
    assert.equal(commentTimeDisplay("not a date", NOW), null);
    assert.equal(commentTimeDisplay("", NOW), null);
  });
});
