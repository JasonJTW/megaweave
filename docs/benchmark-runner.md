# Benchmark runner

The benchmark runner is the only entry point for MegaWeaving synthetic benchmark profiles. It is designed for an isolated benchmark environment only. It must never be pointed at production services or real user data.

```bash
make benchmark-up          # start the isolated MySQL + Redis environment
cd server
BENCHMARK_ENVIRONMENT=isolated npm run benchmark -- --profile <name> [--target <url>] [--output <dir>]
```

`npm run benchmark` loads `server/benchmark.env`, which overrides any database or Redis variables already set in the shell so that a run always connects to the benchmark containers.

| Argument | Required | Description |
| --- | --- | --- |
| `--profile` | Yes | Named profile from `server/src/benchmark/profiles.ts` |
| `--target` | For target-touching profiles | Base URL of the benchmark API, e.g. `http://localhost:8443` |
| `--output` | No | Artifact directory; defaults to `$TMPDIR/megaweave-benchmark-results` |

Unknown arguments, missing values, and unknown profiles are rejected.

## Safety gates

Every check below runs before a profile starts. If any check fails, the runner exits without generating load, writing data, or producing artifacts.

1. **Runner environment.** `BENCHMARK_ENVIRONMENT=isolated` must be set on the machine running the benchmark.
2. **Target marker.** A profile that declares `touchesTarget: true` (it sends traffic to the API, restarts services, or injects faults) requires `--target`. The runner calls `GET <target>/health` and continues only if the response contains `"benchmarkEnvironment": "isolated"`. An unreachable target, a non-2xx response, invalid JSON, or a missing marker are all refused.

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
5. **Data store markers.** Profiles that write MySQL or Redis directly (the `fixture-*` profiles) also require a marker inside each data store:

   | Store | Marker |
   | --- | --- |
   | MySQL | table `benchmark_environment` containing exactly one row, `megaweave-isolated` |
   | Redis cache and vector | key `benchmark:environment` = `megaweave-isolated` |

   MySQL is checked before connecting to Redis, so a wrong database fails immediately. The markers are created only by `docker-compose.benchmark.yml` (`server/db/benchmark-marker.sql` and the `benchmark-marker` job) and the application never writes them, so a production database or Redis instance cannot pass this check.

## Benchmark environment

`docker-compose.benchmark.yml` runs an isolated stack alongside the development containers:

| Service | Image | Host port | Notes |
| --- | --- | --- | --- |
| MySQL | `mysql:8.0` | `127.0.0.1:13306` | Same major version as production; initialized from `server/db/schema.sql`, `reference-data.sql`, and `benchmark-marker.sql` |
| Redis cache | `redis:7-alpine` | `127.0.0.1:16379` | Production memory and eviction settings |
| Redis queue | `redis:7-alpine` | `127.0.0.1:16380` | Production memory and eviction settings |
| Redis vector | `redis/redis-stack-server` | `127.0.0.1:16381` | Production memory and eviction settings |

| Command | Effect |
| --- | --- |
| `make benchmark-up` | Start the stack and write the Redis markers |
| `make benchmark-down` | Stop the stack and keep MySQL data |
| `make benchmark-reset` | Delete MySQL data and re-initialize from the schema |

The cache Redis does not persist data, so rerun `make benchmark-up` after its container restarts to restore the marker.

`server/db/schema.sql` is a structure-only export of production (`mysqldump --no-data`), with `AUTO_INCREMENT` values, `DEFINER` clauses, `DROP TABLE` statements, and server version comments removed. `reference-data.sql` contains only the `categories` and `conditions` lookup tables.

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

| Profile | Touches target | Writes data stores | Description |
| --- | --- | --- | --- |
| `environment-check` | No | No | Validates the environment gate and artifact contract without touching any target |
| `fixture-1k` | No | Yes | Resets the benchmark data stores and loads the 1k-post smoke fixture |
| `fixture-10k` | No | Yes | Resets the benchmark data stores and loads the 10k-post fixture |

```bash
cd server
BENCHMARK_ENVIRONMENT=isolated \
BENCHMARK_API_REPLICAS=1 \
BENCHMARK_WORKER_REPLICAS=1 \
BENCHMARK_RESOURCE_LIMITS='{"api":"1 vCPU / 2 GB","worker":"1 vCPU / 2 GB"}' \
npm run benchmark -- --profile environment-check --output /tmp/megaweave-benchmark
```

Future tickets add `feed-10k`, `queue-burst-500`, and recovery profiles to the same registry.

## Fixture dataset

The `fixture-*` profiles reset the benchmark data stores, load a deterministic dataset, and validate the result. The same seed and post count always produce identical data, identified by the artifact's `dataset.version` and `dataset.fingerprint` (SHA-256 of every generated row).

| Entity | 10k fixture | Shape |
| --- | --- | --- |
| Posts | 10,000 | 60% share / 30% wish / 10% commons; 85% active; 3% soft-deleted; mixed expired, unexpired, and non-expiring; ages skewed toward the last 45 days |
| Users | 2,000 | Zipf-like posting activity; 20% browse without liking and therefore have no interest vector (cold start) |
| Locations | 400 | 25 real district centers across Taiwan with jittered coordinates; fictional addresses |
| Items / images | ~14k / ~20k | 0–5 per post; images reference `benchmark/posts/...` keys with no real S3 objects |
| Likes / comments / weaves | ~28k / ~11k / ~400 | Heavy-tailed engagement; likers favour their preferred category |
| Embeddings | 10,000 posts + ~1.6k users | Synthetic 1536-dim unit vectors |

**Timestamps** are stored as offsets from load time, so post ages, expiry ratios, and hot scores are the same whenever the fixture is loaded.

**Embeddings** never call OpenAI. Each post vector is a category centroid, plus a topic centroid (one per item noun), plus per-post noise. Posts on the same topic have a cosine similarity of about 0.8, posts in the same category about 0.4, and posts in different categories about 0. User interest vectors are the mean of the vectors of the posts they liked. Benchmarks using these vectors measure retrieval and ranking cost, not semantic search quality.

**Production write formats** are reused so that benchmarks exercise real code paths:

- `posts.embedding` uses the same JSON format as the embedding worker
- `post:{id}` and `user:{id}:vector` Redis hashes match the embedding and user-vector workers
- `feed:trending` and `posts.hot_score` use the production `calculatePostHotScore`
- `posts.comment_count` is maintained by the production MySQL triggers
- the vector index is created with the same function the API uses at boot

**Validation** after every load compares expected and actual counts: every table, active and deleted posts, embeddings with 1536 dimensions, Redis vector documents, user vectors, trending members, and per-post `likes_count` and `comment_count` consistency. Any mismatch fails the run.

**Reset** truncates every table except `categories`, `conditions`, and `benchmark_environment`, then flushes the cache and vector Redis and restores their markers. Restart any running API or worker after a load, because they cache post and user vectors in memory.

`user_stats`, messages, notifications, and payment tables are left empty, because the feed and search paths do not read them.

### Integration tests

The fixture's unit tests run in `npm test`. Tests that need the benchmark environment are skipped unless enabled:

```bash
make benchmark-up
cd server
BENCHMARK_INTEGRATION=1 npx jest src/benchmark/fixture/fixture.integration.test.ts
```

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
