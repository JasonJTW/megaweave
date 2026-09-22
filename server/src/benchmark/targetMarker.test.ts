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
});
