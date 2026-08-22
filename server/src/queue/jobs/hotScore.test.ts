import { calculatePostHotScore } from "./hotScore";

describe("calculatePostHotScore", () => {
  it("returns 0 if post status is not active (e.g. inactive)", () => {
    const score = calculatePostHotScore({
      status: "inactive",
      view_count: 100,
      likes_count: 50,
      comment_count: 20,
      weave_count: 10,
      created_at: new Date(),
    });
    expect(score).toBe(0);
  });

  it("calculates engagement score and applies gravity time decay", () => {
    // Engagement: 10*1 + 2*5 + 1*8 + 1*15 = 10 + 10 + 8 + 15 = 43
    // Engagement + 1 = 44
    // 2 hours ago: ageHours = 2, (2 + 2)^1.5 = 4^1.5 = 8
    // Base score = 44 / 8 = 5.5
    // Fresh boost (<= 24h) = 5.5 * 1.2 = 6.6
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const score = calculatePostHotScore({
      status: "active",
      view_count: 10,
      likes_count: 2,
      comment_count: 1,
      weave_count: 1,
      created_at: twoHoursAgo,
    });

    expect(score).toBeCloseTo(6.6, 1);
  });

  it("does not apply 1.2x boost for posts older than 24 hours", () => {
    // 48 hours ago: ageHours = 48
    // ageHours + 2 = 50
    // denominator = 50^1.5 ≈ 353.553
    // Engagement: 100*1 + 10*5 = 150 -> 151
    // score ≈ 151 / 353.553 ≈ 0.4271 (without 1.2x)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const score = calculatePostHotScore({
      status: "active",
      view_count: 100,
      likes_count: 10,
      comment_count: 0,
      weave_count: 0,
      created_at: twoDaysAgo,
    });

    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0);
  });
});
