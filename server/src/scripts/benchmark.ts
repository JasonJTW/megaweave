// server/src/scripts/benchmark.ts
// Benchmark CLI：唯一的 benchmark 入口。
//
//   cd server
//   BENCHMARK_ENVIRONMENT=isolated npm run benchmark -- --profile environment-check

import { tmpdir } from "os";
import { resolve } from "path";
import { z } from "zod";
import { benchmarkProfiles } from "../benchmark/profiles";
import {
  BenchmarkEnvironmentMetadata,
  runBenchmark,
} from "../benchmark/runner";

interface CliArguments {
  profile: string;
  outputDirectory: string;
  targetUrl?: string;
}

const CLI_OPTIONS = ["--profile", "--output", "--target"] as const;
type CliOption = (typeof CLI_OPTIONS)[number];

function parseCliArguments(argv: string[]): CliArguments {
  const values: Partial<Record<CliOption, string>> = {};

  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];

    if (!CLI_OPTIONS.includes(option as CliOption)) {
      throw new Error(
        `Unknown argument: ${option}. Supported: ${CLI_OPTIONS.join(", ")}`,
      );
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${option}`);
    }
    values[option as CliOption] = value;
  }

  if (!values["--profile"]) {
    throw new Error("Missing required argument: --profile");
  }

  return {
    profile: values["--profile"],
    outputDirectory: resolve(
      values["--output"] ?? resolve(tmpdir(), "megaweave-benchmark-results"),
    ),
    targetUrl: values["--target"],
  };
}

function jsonEnvironment<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "must contain valid JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const replicaCountSchema = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer")
  .transform(Number)
  .optional()
  .transform((count) => count ?? ("unknown" as const));

const metadataEnvironmentSchema = z.object({
  BENCHMARK_API_REPLICAS: replicaCountSchema,
  BENCHMARK_WORKER_REPLICAS: replicaCountSchema,
  BENCHMARK_WORKER_CONCURRENCY: jsonEnvironment(
    z.record(z.string(), z.number().int().positive()),
  ).optional(),
  BENCHMARK_RESOURCE_LIMITS: jsonEnvironment(
    z.record(z.string(), z.string()),
  ).optional(),
  BENCHMARK_COST: jsonEnvironment(
    z.record(z.string(), z.union([z.string(), z.number()])),
  ).optional(),
});

function getEnvironmentMetadata(): BenchmarkEnvironmentMetadata {
  const parsed = metadataEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid benchmark metadata environment: ${issues}`);
  }

  const env = parsed.data;
  return {
    deployment: {
      apiReplicas: env.BENCHMARK_API_REPLICAS,
      workerReplicas: env.BENCHMARK_WORKER_REPLICAS,
      workerConcurrency: env.BENCHMARK_WORKER_CONCURRENCY ?? {},
      resourceLimits: env.BENCHMARK_RESOURCE_LIMITS ?? {},
    },
    cost: env.BENCHMARK_COST ?? { currency: "unknown", hourlyEstimate: "unknown" },
  };
}

async function main(): Promise<void> {
  const { profile: profileName, outputDirectory, targetUrl } =
    parseCliArguments(process.argv.slice(2));

  const profile = benchmarkProfiles[profileName];
  if (!profile) {
    throw new Error(
      `Unsupported benchmark profile: ${profileName}. Available: ${Object.keys(benchmarkProfiles).join(", ")}`,
    );
  }

  const result = await runBenchmark({
    profile,
    outputDirectory,
    metadata: getEnvironmentMetadata(),
    targetUrl,
  });

  console.log(
    `Benchmark artifacts written:\n${result.jsonPath}\n${result.summaryPath}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Benchmark failed: ${message}`);
  process.exitCode = 1;
});
