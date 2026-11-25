import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFormatter } from "next-intl";
import { APP_TIME_ZONE, endOfDay, isBeforeToday } from "@/i18n/timeZone";

// What the calendar (timeZone = APP_TIME_ZONE) hands back for 2 Dec: Taipei midnight,
// which is still 1 Dec in UTC. Instants are pinned, so the tests pass on any machine clock.
const PICKED_2_DEC = new Date("2026-12-02T00:00:00+08:00");

describe("APP_TIME_ZONE", () => {
  it("shows a date picked in Taiwan as the same calendar day", () => {
    const format = createFormatter({
      locale: "zh-TW",
      timeZone: APP_TIME_ZONE,
    });
    assert.equal(
      format.dateTime(PICKED_2_DEC, { dateStyle: "long" }),
      "2026年12月2日",
    );
  });
});

describe("endOfDay", () => {
  it("is 23:59:59.999 Taipei time on the picked day", () => {
    assert.equal(
      endOfDay(PICKED_2_DEC).toISOString(),
      "2026-12-02T15:59:59.999Z",
    );
  });

  it("stays on the same day when applied twice, as when a post is edited", () => {
    assert.equal(
      endOfDay(endOfDay(PICKED_2_DEC)).toISOString(),
      "2026-12-02T15:59:59.999Z",
    );
  });
});

describe("isBeforeToday", () => {
  // 1 Dec 23:30 in Taipei, still 1 Dec 15:30 in UTC
  const NOW = new Date("2026-12-01T23:30:00+08:00");

  it("allows today and later", () => {
    assert.equal(
      isBeforeToday(new Date("2026-12-01T00:00:00+08:00"), NOW),
      false,
    );
    assert.equal(isBeforeToday(PICKED_2_DEC, NOW), false);
  });

  it("refuses yesterday", () => {
    assert.equal(
      isBeforeToday(new Date("2026-11-30T00:00:00+08:00"), NOW),
      true,
    );
  });
});
