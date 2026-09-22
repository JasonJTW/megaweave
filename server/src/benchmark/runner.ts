// server/src/benchmark/runner.ts
// Benchmark runner：在執行任何 profile 前做 fail-closed 安全檢查，並輸出自我描述的 JSON + Markdown 結果。

import { execFileSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  BenchmarkDataset,
  BenchmarkProfile,
  DEPENDENCY_MODES,
  DependencyMode,
} from "./profiles";
import { BENCHMARK_HEALTH_ENVIRONMENT } from "./targetMarker";

export const RUNNER_VERSION = "2";
const REQUIRED_ENVIRONMENT = "isolated";
const REAL_PROBE_CONFIRMATION = "allow-real-probe";

export class BenchmarkSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkSafetyError";
  }
}

/** 由操作者提供、描述部署環境的 metadata（profile 本身無法得知）。 */
export interface BenchmarkEnvironmentMetadata {
  deployment: {
    apiReplicas: number | "unknown";
    workerReplicas: number | "unknown";
    workerConcurrency: Record<string, number>;
    resourceLimits: Record<string, string>;
  };
  cost: Record<string, string | number>;
}

export interface BenchmarkRunRequest {
  profile: BenchmarkProfile;
  outputDirectory: string;
  metadata: BenchmarkEnvironmentMetadata;
  targetUrl?: string;
}

export interface BenchmarkRunResult {
  jsonPath: string;
  summaryPath: string;
}

export interface BenchmarkArtifact extends BenchmarkEnvironmentMetadata {
  timestamp: string;
  profile: string;
  runnerVersion: string;
  commitSha: string;
  workingTreeDirty: boolean | "unknown";
  target: string | null;
  dataset: BenchmarkDataset;
  workload: Record<string, unknown>;
  dependencies: Record<string, DependencyMode>;
  result: Record<string, unknown>;
}

function assertBenchmarkEnvironment(): void {
  if (process.env.BENCHMARK_ENVIRONMENT !== REQUIRED_ENVIRONMENT) {
    throw new BenchmarkSafetyError(
      `Benchmark execution requires BENCHMARK_ENVIRONMENT=${REQUIRED_ENVIRONMENT}`,
    );
  }
}

function assertSafeProfileName(profile: string): void {
  // profile 名稱會成為結果檔名，禁止 "." 與 "/" 以免寫出輸出目錄之外
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile)) {
    throw new BenchmarkSafetyError(
      "Benchmark profile names may contain lowercase letters, numbers, and single hyphens only",
    );
  }
}

function assertDependencyModes(profile: BenchmarkProfile): void {
  for (const [dependency, mode] of Object.entries(profile.dependencies)) {
    if (!DEPENDENCY_MODES.includes(mode)) {
      throw new BenchmarkSafetyError(
        `Unsupported benchmark dependency mode for ${dependency}: ${mode}`,
      );
    }

    if (
      mode === "real-probe" &&
      process.env.BENCHMARK_REAL_PROBE_CONFIRMATION !== REAL_PROBE_CONFIRMATION
    ) {
      throw new BenchmarkSafetyError(
        `Real probe for ${dependency} requires BENCHMARK_REAL_PROBE_CONFIRMATION=${REAL_PROBE_CONFIRMATION}`,
      );
    }
  }
}

async function assertBenchmarkTarget(targetUrl: string): Promise<void> {
  const healthUrl = new URL("/health", targetUrl).toString();
  let response: Response;

  try {
    response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new BenchmarkSafetyError(
      `Unable to verify benchmark target at ${healthUrl}`,
    );
  }

  if (!response.ok) {
    throw new BenchmarkSafetyError(
      `Benchmark target health check failed with HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BenchmarkSafetyError(
      "Benchmark target health check returned invalid JSON",
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    (body as { benchmarkEnvironment?: unknown }).benchmarkEnvironment !==
      BENCHMARK_HEALTH_ENVIRONMENT
  ) {
    throw new BenchmarkSafetyError(
      "Benchmark target does not advertise the required isolated marker",
    );
  }
}

function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function buildSummary(artifact: BenchmarkArtifact): string {
  return [
    `# Benchmark: ${artifact.profile}`,
    "",
    `- Timestamp: ${artifact.timestamp}`,
    `- Commit: ${artifact.commitSha}${artifact.workingTreeDirty === true ? " (dirty working tree)" : ""}`,
    `- Runner version: ${artifact.runnerVersion}`,
    `- Target: ${artifact.target ?? "none"}`,
    `- Dataset: ${artifact.dataset.version}`,
    `- Dataset counts: ${JSON.stringify(artifact.dataset.counts)}`,
    `- Workload: ${JSON.stringify(artifact.workload)}`,
    `- API replicas: ${artifact.deployment.apiReplicas}`,
    `- Worker replicas: ${artifact.deployment.workerReplicas}`,
    `- Worker concurrency: ${JSON.stringify(artifact.deployment.workerConcurrency)}`,
    `- Resource limits: ${JSON.stringify(artifact.deployment.resourceLimits)}`,
    `- Dependencies: ${JSON.stringify(artifact.dependencies)}`,
    `- Cost metadata: ${JSON.stringify(artifact.cost)}`,
    "",
    "## Result",
    "",
    "```json",
    JSON.stringify(artifact.result, null, 2),
    "```",
    "",
  ].join("\n");
}

export async function runBenchmark(
  request: BenchmarkRunRequest,
): Promise<BenchmarkRunResult> {
  const { profile } = request;

  // 所有安全檢查都在 profile.run() 之前完成，任何一項失敗都不會產生負載或寫入
  assertBenchmarkEnvironment();
  assertSafeProfileName(profile.name);
  assertDependencyModes(profile);

  if (profile.touchesTarget) {
    if (!request.targetUrl) {
      throw new BenchmarkSafetyError(
        `Profile ${profile.name} touches the target and requires a target URL`,
      );
    }
    await assertBenchmarkTarget(request.targetUrl);
  }

  const targetUrl = profile.touchesTarget ? request.targetUrl : undefined;
  const { dataset, result } = await profile.run({ targetUrl });
  const status = runGit(["status", "--porcelain"]);
  const timestamp = new Date().toISOString();
  const artifact: BenchmarkArtifact = {
    timestamp,
    profile: profile.name,
    runnerVersion: RUNNER_VERSION,
    commitSha: runGit(["rev-parse", "HEAD"]) ?? "unknown",
    workingTreeDirty: status === null ? "unknown" : status.length > 0,
    target: targetUrl ?? null,
    dataset,
    workload: profile.workload,
    dependencies: profile.dependencies,
    ...request.metadata,
    result,
  };
  const artifactBaseName = `${profile.name}-${timestamp.replace(/[:.]/g, "-")}`;
  const jsonPath = join(request.outputDirectory, `${artifactBaseName}.json`);
  const summaryPath = join(request.outputDirectory, `${artifactBaseName}.md`);

  await mkdir(request.outputDirectory, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(summaryPath, buildSummary(artifact), "utf8");

  return { jsonPath, summaryPath };
}
