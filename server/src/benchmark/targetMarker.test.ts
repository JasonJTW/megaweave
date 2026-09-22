import { getBenchmarkHealthFields } from "./targetMarker";

describe("benchmark target marker", () => {
  it("advertises the isolated marker only when explicitly configured", () => {
    expect(
      getBenchmarkHealthFields({ BENCHMARK_TARGET_MARKER: "megaweave-isolated" }),
    ).toEqual({ benchmarkEnvironment: "isolated" });
  });

  it.each([
    ["unset", {}],
    ["set to another value", { BENCHMARK_TARGET_MARKER: "isolated" }],
    ["confused with the runner-side variable", { BENCHMARK_ENVIRONMENT: "isolated" }],
  ])("does not advertise the marker when %s", (_label, env) => {
    expect(getBenchmarkHealthFields(env)).toEqual({});
  });

  it("exposes internal metrics only on a marked benchmark target", () => {
    const getMetrics = jest.fn(() => ({ feedCandidateVectorReads: { failed: 2 } }));

    expect(
      getBenchmarkHealthFields({ BENCHMARK_TARGET_MARKER: "megaweave-isolated" }, getMetrics),
    ).toEqual({
      benchmarkEnvironment: "isolated",
      benchmarkMetrics: { feedCandidateVectorReads: { failed: 2 } },
    });
    expect(getBenchmarkHealthFields({}, getMetrics)).toEqual({});
    // production 不應為了 /health 計算任何內部指標
    expect(getMetrics).toHaveBeenCalledTimes(1);
  });
});
