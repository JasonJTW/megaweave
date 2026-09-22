import { execFile } from "child_process";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const scriptPath = resolve(__dirname, "benchmark.ts");

function runCli(args: string[], env: Record<string, string> = {}) {
  return execFileAsync(
    process.execPath,
    ["-r", "ts-node/register/transpile-only", scriptPath, ...args],
    { env: { PATH: process.env.PATH ?? "", ...env } },
  );
}

describe("benchmark CLI", () => {
  let outputDirectory: string;

  beforeEach(async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), "megaweave-benchmark-cli-"));
  });

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true });
  });

  it("refuses an invocation without the isolated-environment marker", async () => {
    await expect(
      runCli(["--profile", "environment-check", "--output", outputDirectory]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("BENCHMARK_ENVIRONMENT=isolated"),
    });
    expect(await readdir(outputDirectory)).toEqual([]);
  });

  it("writes JSON and Markdown artifacts for a named profile", async () => {
    const { stdout } = await runCli(
      ["--profile", "environment-check", "--output", outputDirectory],
      {
        BENCHMARK_ENVIRONMENT: "isolated",
        BENCHMARK_API_REPLICAS: "1",
        BENCHMARK_WORKER_REPLICAS: "1",
        BENCHMARK_RESOURCE_LIMITS: '{"api":"1 vCPU / 2 GB"}',
      },
    );

    const files = (await readdir(outputDirectory)).sort();
    expect(files).toEqual([
      expect.stringMatching(/^environment-check-.*\.json$/),
      expect.stringMatching(/^environment-check-.*\.md$/),
    ]);
    expect(stdout).toContain(files[0]);

    const artifact = JSON.parse(
      await readFile(join(outputDirectory, files[0]), "utf8"),
    );
    expect(artifact).toMatchObject({
      profile: "environment-check",
      deployment: {
        apiReplicas: 1,
        workerReplicas: 1,
        workerConcurrency: {},
        resourceLimits: { api: "1 vCPU / 2 GB" },
      },
      result: { status: "environment-ready" },
    });
  });

  it.each([
    [["--profile", "does-not-exist"], "Unsupported benchmark profile"],
    [[], "Missing required argument: --profile"],
    [["--profile"], "Missing value for --profile"],
    [["--profile", "environment-check", "--dry-run", "yes"], "Unknown argument: --dry-run"],
  ])("rejects invalid arguments %j", async (args, message) => {
    await expect(
      runCli([...args, "--output", outputDirectory], {
        BENCHMARK_ENVIRONMENT: "isolated",
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining(message) });
    expect(await readdir(outputDirectory)).toEqual([]);
  });

  it("rejects malformed deployment metadata", async () => {
    await expect(
      runCli(["--profile", "environment-check", "--output", outputDirectory], {
        BENCHMARK_ENVIRONMENT: "isolated",
        BENCHMARK_API_REPLICAS: "two",
        BENCHMARK_RESOURCE_LIMITS: "{not json",
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringMatching(
        /BENCHMARK_API_REPLICAS.*non-negative integer.*BENCHMARK_RESOURCE_LIMITS.*valid JSON/,
      ),
    });
  });
});
