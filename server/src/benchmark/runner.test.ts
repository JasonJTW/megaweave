import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { HostInfo } from "./hostInfo";
import { BenchmarkProfile } from "./profiles";
import {
  BenchmarkEnvironmentMetadata,
  BenchmarkSafetyError,
  runBenchmark,
} from "./runner";

const fakeHost: HostInfo = {
  platform: "linux",
  osRelease: "6.1.0",
  arch: "x64",
  cpuModel: "Test CPU",
  logicalCpus: 2,
  totalMemoryGb: 2,
  nodeVersion: "v22.0.0",
  aws: { instanceType: "t3.small", region: "ap-northeast-1" },
  docker: null,
};

// 避免每個測試都實際偵測 EC2 metadata 與 Docker
jest.mock("./hostInfo", () => ({
  ...jest.requireActual("./hostInfo"),
  collectHostInfo: jest.fn(async () => fakeHost),
}));

const originalEnvironment = process.env;
const metadata: BenchmarkEnvironmentMetadata = {
  deployment: {
    apiReplicas: 1,
    workerReplicas: 1,
    workerConcurrency: { "post-embedding": 2 },
    resourceLimits: { api: "1 vCPU / 2 GB", worker: "1 vCPU / 2 GB" },
  },
  cost: { currency: "USD", hourlyEstimate: "unknown" },
};

function createProfile(overrides: Partial<BenchmarkProfile> = {}): BenchmarkProfile {
  return {
    name: "fixture-profile",
    description: "Test fixture profile",
    touchesTarget: false,
    workload: { virtualUsers: 5, durationSeconds: 60 },
    dependencies: { openai: "mock", mysql: "benchmark", redis: "benchmark" },
    run: jest.fn(async () => ({
      dataset: { version: "fixture-v1", counts: { posts: 10 } },
      result: { requests: 42 },
    })),
    ...overrides,
  };
}

/** 啟動回傳固定 /health 回應的本地 server，模擬 benchmark 目標。 */
async function startHealthServer(
  status: number,
  body: string,
): Promise<{ server: Server; url: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

describe("benchmark runner", () => {
  let outputDirectory: string;
  let healthServer: Server | undefined;

  beforeEach(async () => {
    process.env = { ...originalEnvironment, BENCHMARK_ENVIRONMENT: "isolated" };
    delete process.env.BENCHMARK_REAL_PROBE_CONFIRMATION;
    outputDirectory = await mkdtemp(join(tmpdir(), "megaweave-benchmark-"));
  });

  afterEach(async () => {
    process.env = originalEnvironment;
    await rm(outputDirectory, { recursive: true, force: true });
    if (healthServer) {
      await new Promise((resolve) => healthServer?.close(resolve));
      healthServer = undefined;
    }
  });

  async function expectRefused(
    profile: BenchmarkProfile,
    targetUrl?: string,
  ): Promise<void> {
    await expect(
      runBenchmark({ profile, outputDirectory, metadata, targetUrl }),
    ).rejects.toBeInstanceOf(BenchmarkSafetyError);

    expect(profile.run).not.toHaveBeenCalled();
    expect(await readdir(outputDirectory)).toEqual([]);
  }

  it("refuses to run without the isolated-environment marker", async () => {
    delete process.env.BENCHMARK_ENVIRONMENT;

    await expectRefused(createProfile());
  });

  it("writes self-describing JSON and Markdown artifacts", async () => {
    const result = await runBenchmark({
      profile: createProfile(),
      outputDirectory,
      metadata,
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, "utf8"));
    const summary = await readFile(result.summaryPath, "utf8");

    expect(artifact).toMatchObject({
      profile: "fixture-profile",
      runnerVersion: expect.any(String),
      commitSha: expect.any(String),
      timestamp: expect.any(String),
      target: null,
      dataset: { version: "fixture-v1", counts: { posts: 10 } },
      workload: { virtualUsers: 5, durationSeconds: 60 },
      deployment: metadata.deployment,
      dependencies: { openai: "mock", mysql: "benchmark", redis: "benchmark" },
      cost: metadata.cost,
      result: { requests: 42 },
    });
    expect(summary).toContain("# Benchmark: fixture-profile");
    expect(summary).toContain("fixture-v1");
    expect(summary).toContain('Worker concurrency: {"post-embedding":2}');
    expect(summary).toContain('Dependencies: {"openai":"mock"');
  });

  it("records the host and the service versions reported by the profile", async () => {
    const result = await runBenchmark({
      profile: createProfile({
        describeServices: jest.fn(async () => ({ mysql: "8.0.46" })),
      }),
      outputDirectory,
      metadata,
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, "utf8"));
    const summary = await readFile(result.summaryPath, "utf8");
    expect(artifact.host).toEqual(fakeHost);
    expect(artifact.services).toEqual({ mysql: "8.0.46" });
    expect(summary).toContain("- Host: AWS t3.small (ap-northeast-1), linux 6.1.0 x64");
    expect(summary).toContain('- Services: {"mysql":"8.0.46"}');
  });

  it("describes services before the profile disposes its connections", async () => {
    const calls: string[] = [];
    await runBenchmark({
      profile: createProfile({
        describeServices: jest.fn(async () => {
          calls.push("describeServices");
          return {};
        }),
        dispose: jest.fn(async () => {
          calls.push("dispose");
        }),
      }),
      outputDirectory,
      metadata,
    });

    expect(calls).toEqual(["describeServices", "dispose"]);
  });

  it("refuses a target-touching profile without a target URL", async () => {
    await expectRefused(createProfile({ touchesTarget: true }));
  });

  it("refuses an unreachable target", async () => {
    await expectRefused(createProfile({ touchesTarget: true }), "http://127.0.0.1:1");
  });

  it.each([
    ["does not advertise the marker", 200, JSON.stringify({ status: "OK" })],
    ["advertises a different marker", 200, JSON.stringify({ benchmarkEnvironment: "production" })],
    ["returns a non-2xx status", 503, JSON.stringify({ benchmarkEnvironment: "isolated" })],
    ["returns invalid JSON", 200, "not json"],
  ])("refuses a target that %s", async (_label, status, body) => {
    const target = await startHealthServer(status, body);
    healthServer = target.server;

    await expectRefused(createProfile({ touchesTarget: true }), target.url);
  });

  it("runs a target-touching profile against a verified isolated target", async () => {
    const target = await startHealthServer(
      200,
      JSON.stringify({ status: "OK", benchmarkEnvironment: "isolated" }),
    );
    healthServer = target.server;
    const profile = createProfile({ touchesTarget: true });

    const result = await runBenchmark({
      profile,
      outputDirectory,
      metadata,
      targetUrl: target.url,
    });

    expect(profile.run).toHaveBeenCalledWith({ targetUrl: target.url });
    const artifact = JSON.parse(await readFile(result.jsonPath, "utf8"));
    expect(artifact.target).toBe(target.url);
  });

  it("does not pass a target to a profile that declares it never touches one", async () => {
    const profile = createProfile();

    await runBenchmark({
      profile,
      outputDirectory,
      metadata,
      targetUrl: "http://production.example",
    });

    expect(profile.run).toHaveBeenCalledWith({ targetUrl: undefined });
  });

  it("refuses a real-service probe without explicit confirmation", async () => {
    await expectRefused(createProfile({ dependencies: { openai: "real-probe" } }));
  });

  it("records a confirmed real-service probe distinctly from mocks", async () => {
    process.env.BENCHMARK_REAL_PROBE_CONFIRMATION = "allow-real-probe";

    const result = await runBenchmark({
      profile: createProfile({
        dependencies: { openai: "real-probe", mysql: "benchmark" },
      }),
      outputDirectory,
      metadata,
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, "utf8"));
    expect(artifact.dependencies).toEqual({ openai: "real-probe", mysql: "benchmark" });
  });

  it("refuses an unsupported dependency mode", async () => {
    await expectRefused(
      createProfile({
        dependencies: { openai: "production" as unknown as "mock" },
      }),
    );
  });

  it("refuses a profile name that could escape the artifact directory", async () => {
    await expectRefused(createProfile({ name: "../unsafe" }));
  });

  it("does not run a profile whose own safety check fails, but still disposes it", async () => {
    const dispose = jest.fn(async () => {});
    const profile = createProfile({
      assertSafeToRun: jest.fn(async () => {
        throw new BenchmarkSafetyError("database is not a benchmark database");
      }),
      dispose,
    });

    await expectRefused(profile);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("runs the profile safety check only after the runner's own checks", async () => {
    delete process.env.BENCHMARK_ENVIRONMENT;
    const assertSafeToRun = jest.fn(async () => {});

    await expectRefused(createProfile({ assertSafeToRun }));
    expect(assertSafeToRun).not.toHaveBeenCalled();
  });

  it("disposes the profile after a successful run", async () => {
    const dispose = jest.fn(async () => {});

    await runBenchmark({ profile: createProfile({ dispose }), outputDirectory, metadata });

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("records passing invariants and reports the run as passed", async () => {
    const result = await runBenchmark({
      profile: createProfile({
        run: jest.fn(async () => ({
          dataset: { version: "fixture-v1", counts: {} },
          result: {},
          invariants: [{ name: "no-http-errors", ok: true }],
        })),
      }),
      outputDirectory,
      metadata,
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, "utf8"));
    expect(result.passed).toBe(true);
    expect(artifact.passed).toBe(true);
    expect(artifact.invariants).toEqual([{ name: "no-http-errors", ok: true }]);
  });

  it("still writes artifacts for a completed run whose invariants fail, but reports it as failed", async () => {
    const result = await runBenchmark({
      profile: createProfile({
        run: jest.fn(async () => ({
          dataset: { version: "fixture-v1", counts: {} },
          result: { errors: 3 },
          invariants: [
            { name: "no-http-errors", ok: false, detail: "3 of 120 requests failed" },
          ],
        })),
      }),
      outputDirectory,
      metadata,
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, "utf8"));
    const summary = await readFile(result.summaryPath, "utf8");
    expect(result.passed).toBe(false);
    expect(artifact.passed).toBe(false);
    expect(summary).toContain("FAIL no-http-errors: 3 of 120 requests failed");
  });

  it("uses the profile's own summary instead of dumping the result JSON", async () => {
    const result = await runBenchmark({
      profile: createProfile({
        run: jest.fn(async () => ({
          dataset: { version: "fixture-v1", counts: {} },
          result: { rawLatenciesMs: [1, 2, 3] },
          summary: "| Scenario | p95 |\n| --- | --- |\n| warm | 12 ms |",
        })),
      }),
      outputDirectory,
      metadata,
    });

    const artifact = JSON.parse(await readFile(result.jsonPath, "utf8"));
    const summary = await readFile(result.summaryPath, "utf8");
    expect(artifact.result).toEqual({ rawLatenciesMs: [1, 2, 3] });
    expect(summary).toContain("| warm | 12 ms |");
    expect(summary).not.toContain("rawLatenciesMs");
  });

  it("writes no artifacts when the profile fails", async () => {
    const profile = createProfile({
      run: jest.fn(async () => {
        throw new Error("load generator crashed");
      }),
    });

    await expect(
      runBenchmark({ profile, outputDirectory, metadata }),
    ).rejects.toThrow("load generator crashed");
    expect(await readdir(outputDirectory)).toEqual([]);
  });
});
