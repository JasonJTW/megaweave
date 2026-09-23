import { createRandom } from "../fixture/random";
import { BurstCandidates, generateBurstPlan, generatePostDraft } from "./burstPlan";

const candidates: BurstCandidates = {
  userIds: Array.from({ length: 50 }, (_, i) => i + 1),
  interactionPostIds: Array.from({ length: 40 }, (_, i) => 1000 + i),
  locations: [
    { id: 1, province: "臺北市", city: "大安區" },
    { id: 2, province: "新北市", city: "板橋區" },
  ],
};

describe("queue burst plan", () => {
  it("is deterministic for the same seed and candidates", () => {
    expect(generateBurstPlan({ seed: 7, units: 30, candidates })).toEqual(
      generateBurstPlan({ seed: 7, units: 30, candidates }),
    );
    expect(generateBurstPlan({ seed: 8, units: 30, candidates })).not.toEqual(
      generateBurstPlan({ seed: 7, units: 30, candidates }),
    );
  });

  it("gives every unit one new post with images and one interaction, using only fixture identities", () => {
    const plan = generateBurstPlan({ seed: 7, units: 200, candidates });

    expect(plan).toHaveLength(200);
    for (const unit of plan) {
      expect(unit.images).toBeGreaterThanOrEqual(1);
      expect(unit.images).toBeLessThanOrEqual(5);
      expect(candidates.userIds).toContain(unit.post.userId);
      expect(candidates.userIds).toContain(unit.interaction.userId);
      expect(candidates.interactionPostIds).toContain(unit.interaction.postId);
      expect(["view", "like", "comment", "weave"]).toContain(unit.interaction.action);
    }
  });

  it("never repeats a (user, post, action) interaction, which the producer would deduplicate", () => {
    const plan = generateBurstPlan({ seed: 7, units: 500, candidates });
    const keys = plan.map((unit) => `${unit.interaction.userId}:${unit.interaction.postId}:${unit.interaction.action}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses more units than there are distinct interactions", () => {
    expect(() =>
      generateBurstPlan({
        seed: 1,
        units: 10,
        candidates: { ...candidates, userIds: [1], interactionPostIds: [2] },
      }),
    ).toThrow(/distinct interactions/);
  });
});

describe("post draft", () => {
  it("satisfies the public create-post contract", () => {
    const random = createRandom(3);
    for (let i = 0; i < 300; i++) {
      const draft = generatePostDraft(random);
      expect(draft.title.length).toBeGreaterThanOrEqual(5);
      expect(draft.title.length).toBeLessThanOrEqual(60);
      expect(draft.content.length).toBeGreaterThanOrEqual(3);
      expect(draft.content.length).toBeLessThanOrEqual(1000);
      expect(draft.conditionLevel).toBeGreaterThanOrEqual(1);
      expect(draft.conditionLevel).toBeLessThanOrEqual(5);
      expect(draft.items.length).toBeGreaterThanOrEqual(1);
      expect(new Set(draft.items.map((item) => item.title)).size).toBe(draft.items.length);
      expect(draft.items.every((item) => item.title.length <= 20 && item.quantity >= 1)).toBe(true);
      expect((draft.tags ?? "").length).toBeLessThanOrEqual(500);
    }
  });
});
