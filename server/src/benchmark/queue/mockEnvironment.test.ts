import { BenchmarkSafetyError } from "../errors";
import { resolveMockEndpoints } from "./mockEnvironment";

const valid = {
  OPENAI_BASE_URL: "http://127.0.0.1:18090/v1",
  AWS_ENDPOINT_URL_S3: "http://127.0.0.1:18091",
  BUCKET_NAME: "megaweave-benchmark",
  STAGING_BUCKET_NAME: "megaweave-benchmark-staging",
};

describe("mock endpoint configuration", () => {
  it("resolves the mock ports and buckets from the benchmark environment", () => {
    expect(resolveMockEndpoints(valid)).toEqual({
      openAiPort: 18090,
      s3Port: 18091,
      bucket: "megaweave-benchmark",
      stagingBucket: "megaweave-benchmark-staging",
    });
  });

  it.each([
    ["a real service", { OPENAI_BASE_URL: "https://api.openai.com/v1" }, "OPENAI_BASE_URL"],
    ["localhost, which the S3 SDK addresses virtual-host style", { AWS_ENDPOINT_URL_S3: "http://localhost:18091" }, "AWS_ENDPOINT_URL_S3"],
    ["an endpoint without an explicit port", { AWS_ENDPOINT_URL_S3: "http://127.0.0.1" }, "AWS_ENDPOINT_URL_S3"],
    ["a missing variable", { OPENAI_BASE_URL: undefined }, "OPENAI_BASE_URL is required"],
    ["a value that is not a URL", { OPENAI_BASE_URL: "not a url" }, "OPENAI_BASE_URL must be a URL"],
  ])("refuses %s", (_, overrides, message) => {
    const resolve = () => resolveMockEndpoints({ ...valid, ...overrides });
    expect(resolve).toThrow(BenchmarkSafetyError);
    expect(resolve).toThrow(message);
  });
});
