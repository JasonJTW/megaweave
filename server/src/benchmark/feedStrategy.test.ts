import { resolveFeedStrategy } from "./feedStrategy";

const benchmarkTarget = { BENCHMARK_TARGET_MARKER: "megaweave-isolated" };

describe("benchmark feed strategy selection", () => {
  it("selects the full-hydration baseline on a marked benchmark target", () => {
    expect(resolveFeedStrategy("full-hydration", benchmarkTarget)).toBe("full-hydration");
  });

  it.each([
    ["no header", undefined],
    ["the current strategy", "late-materialization"],
    ["an unknown strategy", "FULL-HYDRATION"],
    ["a repeated header", ["full-hydration", "full-hydration"]],
  ])("keeps the current strategy on a benchmark target for %s", (_label, header) => {
    expect(resolveFeedStrategy(header, benchmarkTarget)).toBe("late-materialization");
  });

  it.each([
    ["unset", {}],
    ["set to another value", { BENCHMARK_TARGET_MARKER: "isolated" }],
  ])("ignores the header when the target marker is %s", (_label, env) => {
    // production 永遠不會切換到 baseline，也不會回應策略標頭
    expect(resolveFeedStrategy("full-hydration", env)).toBeNull();
  });
});
