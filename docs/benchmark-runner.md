# Benchmark runner

The benchmark runner is the only entry point for MegaWeaving synthetic benchmark profiles. It is designed for an isolated benchmark environment only. It must never be pointed at production services or real user data.

```bash
cd server
BENCHMARK_ENVIRONMENT=isolated npm run benchmark -- --profile <name> [--target <url>] [--output <dir>]
```

| Argument | Required | Description |
| --- | --- | --- |
| `--profile` | Yes | Named profile from `server/src/benchmark/profiles.ts` |
| `--target` | For target-touching profiles | Base URL of the benchmark API, e.g. `http://localhost:8443` |
| `--output` | No | Artifact directory; defaults to `$TMPDIR/megaweave-benchmark-results` |

Unknown arguments, missing values, and unknown profiles are rejected.

## Safety gates

Every check below runs before a profile starts. If any check fails, the runner exits without generating load, writing data, or producing artifacts.

1. **Runner environment.** `BENCHMARK_ENVIRONMENT=isolated` must be set on the machine running the benchmark.
2. **Target marker.** A profile that declares `touchesTarget: true` (it writes fixtures, generates load, restarts services, or injects faults) requires `--target`. The runner calls `GET <target>/health` and continues only if the response contains `"benchmarkEnvironment": "isolated"`. An unreachable target, a non-2xx response, invalid JSON, or a missing marker are all refused.

   The API advertises this marker only when it is started with:

   ```bash
   BENCHMARK_TARGET_MARKER=megaweave-isolated
   ```

   Set this only in benchmark-specific configuration. It must never appear in production environment files or deployment settings.
3. **Dependency modes.** Each profile declares how it uses every external dependency:

   | Mode | Meaning |
   | --- | --- |
   | `mock` | Replaced by a controlled fake; no external call |
   | `benchmark` | A real service dedicated to benchmarking, e.g. the local MySQL/Redis |
   | `real-probe` | A small number of calls to a real external service, e.g. OpenAI |

   A `real-probe` additionally requires `BENCHMARK_REAL_PROBE_CONFIRMATION=allow-real-probe`, because it can spend money or trigger real side effects.
4. **Profile name.** Profile names become artifact file names, so they may contain only lowercase letters, numbers, and single hyphens.

## Deployment metadata

Profiles define their own dataset, workload, and dependency modes. The operator describes the deployment through optional environment variables, validated before the run:

| Variable | Format | Example |
| --- | --- | --- |
| `BENCHMARK_API_REPLICAS` | Non-negative integer | `1` |
| `BENCHMARK_WORKER_REPLICAS` | Non-negative integer | `1` |
| `BENCHMARK_WORKER_CONCURRENCY` | JSON object of positive integers | `{"post-embedding":2}` |
| `BENCHMARK_RESOURCE_LIMITS` | JSON object of strings | `{"api":"1 vCPU / 2 GB"}` |
| `BENCHMARK_COST` | JSON object of strings/numbers | `{"currency":"USD","hourlyEstimate":0.05}` |

Omitted replica counts are recorded as `"unknown"`.

## Profiles

| Profile | Touches target | Description |
| --- | --- | --- |
| `environment-check` | No | Validates the environment gate and artifact contract without touching any target |

```bash
cd server
BENCHMARK_ENVIRONMENT=isolated \
BENCHMARK_API_REPLICAS=1 \
BENCHMARK_WORKER_REPLICAS=1 \
BENCHMARK_RESOURCE_LIMITS='{"api":"1 vCPU / 2 GB","worker":"1 vCPU / 2 GB"}' \
npm run benchmark -- --profile environment-check --output /tmp/megaweave-benchmark
```

Future tickets add `feed-10k`, `queue-burst-500`, and recovery profiles to the same registry.

## Artifacts

Each run writes one JSON artifact and one Markdown summary named `<profile>-<timestamp>`. The JSON artifact is canonical and contains:

- timestamp, commit SHA, whether the working tree was dirty, runner version, and profile name
- verified target URL, or `null` for profiles that do not touch a target
- dataset version and counts
- workload definition
- API/worker replica counts, worker concurrency, and resource limits
- dependency modes and cost metadata
- profile result data

Artifacts are written outside the repository by default. Commit only curated result summaries. Do not include credentials, production connection strings, or personal data in metadata or results.
