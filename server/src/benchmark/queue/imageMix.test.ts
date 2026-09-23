import { assignImageVariants, countVariants, RAW_IMAGE_MIX, TYPICAL_IMAGE_MIX } from "./imageMix";

describe("queue burst source image mix", () => {
  it("assigns the same variants for the same seed and count", () => {
    const first = assignImageVariants({ seed: 7, count: 200, mix: TYPICAL_IMAGE_MIX }).map((v) => v.name);
    const second = assignImageVariants({ seed: 7, count: 200, mix: TYPICAL_IMAGE_MIX }).map((v) => v.name);
    expect(second).toEqual(first);
  });

  it("follows the configured shares", () => {
    const counts = countVariants(assignImageVariants({ seed: 1, count: 10_000, mix: TYPICAL_IMAGE_MIX }));
    expect(counts["client-webp"] / 10_000).toBeCloseTo(0.5, 1);
    expect(counts["client-jpeg"] / 10_000).toBeCloseTo(0.3, 1);
    expect(counts.raw / 10_000).toBeCloseTo(0.2, 1);
  });

  it("uses only uncompressed photos in the raw mix", () => {
    expect(countVariants(assignImageVariants({ seed: 1, count: 50, mix: RAW_IMAGE_MIX }))).toEqual({ raw: 50 });
  });

  it("marks client WebP uploads small enough for the worker to skip re-encoding", () => {
    const webp = TYPICAL_IMAGE_MIX.find((v) => v.name === "client-webp")!;
    expect(webp.format).toBe("webp");
    expect(Math.max(webp.width, webp.height)).toBeLessThanOrEqual(1200);
  });
});
