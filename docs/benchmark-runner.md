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

   A marked target also returns `benchmarkMetrics` from `/health`: `feedCandidateVectorReads` (candidate vector Redis reads, failures, vectors missing from Redis, and in-memory cache hits since the process started), `feedVectorCaches` (in-memory vector cache sizes), and `process` (API CPU time, RSS, and heap). Profiles use these counters to detect silent ranking degradation and to observe API resource use. Unmarked targets never compute or expose them.

   Only a marked target also accepts the benchmark-only controls used by `feed-*` profiles: the `x-benchmark-feed-strategy` request header on `GET /api/posts/feed`, and `POST /benchmark/feed-caches/reset`. See [Feed profiles](#feed-profiles).
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
| `feed-10k` | Yes | Yes | Loads the 10k fixture, then compares the full-hydration baseline with the current feed over HTTP (about 2.7 hours) |
| `feed-1k-smoke` | Yes | Yes | Same flow on the 1k fixture with one short repetition at 5 VUs (about 4 minutes); for checking the profile, not for results |

```bash
cd server
BENCHMARK_ENVIRONMENT=isolated \
BENCHMARK_API_REPLICAS=1 \
BENCHMARK_WORKER_REPLICAS=1 \
BENCHMARK_RESOURCE_LIMITS='{"api":"1 vCPU / 2 GB","worker":"1 vCPU / 2 GB"}' \
npm run benchmark -- --profile environment-check --output /tmp/megaweave-benchmark
```

Future tickets add `queue-burst-500` and recovery profiles to the same registry.

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

## Feed profiles

`feed-10k` measures the current feed (candidate retrieval, in-memory rerank, and hydration of the returned page only) against an equivalent full-hydration baseline, through the public `GET /api/posts/feed` endpoint.

### Running

Start an API against the benchmark data stores, then run the profile against it:

```bash
make benchmark-up
cd server
npm run benchmark:api      # builds, then serves http://localhost:18443 with server/benchmark.env
# in another terminal
BENCHMARK_ENVIRONMENT=isolated BENCHMARK_API_REPLICAS=1 BENCHMARK_WORKER_REPLICAS=0 \
  npm run benchmark -- --profile feed-10k --target http://localhost:18443
```

`npm run benchmark:api` runs the compiled server (as production does) with the benchmark target marker, rate limiting disabled, and no inline workers. No worker is needed, because the feed path does not enqueue jobs. The profile reloads the fixture itself and clears the API's in-memory caches through the reset endpoint, so the API does not need a restart.

### Strategies

| Strategy | Header value | Behavior |
| --- | --- | --- |
| Baseline | `full-hydration` | The candidate query does the full 6-table join for every candidate. Filtered feeds read `posts.embedding` from MySQL when the user has an interest vector. Personalized feeds hydrate all KNN candidates, including `is_liked`. This is the hydration approach used before late materialization (`b97b1cb`), with the current candidate limits, ordering, and response fields. The pre-`b97b1cb` code also fetched more filtered candidates and always selected `embedding`. Keeping those would change the results or cost more, so the baseline is conservative. |
| Current | `late-materialization` | A lightweight candidate query, vectors from the in-memory cache or Redis, and a 6-table hydration of only the returned page. |

Ranking formulas, candidate limits, and response fields are shared, so both strategies must return identical responses. Before measuring, the profile sends eight fixed requests that cover the personalized, filtered, tinder, cold-start geo, and trending paths to both strategies. If any response differs, is empty, is not personalized when it should be, or reports a strategy other than the one requested, the profile skips performance measurement and writes artifacts with a failed `strategy-equivalence` invariant. It also checks that the returned posts are active in the benchmark MySQL, which catches an API connected to different data stores.

The trending feed and the cold-start geo feed without a user vector read no embeddings. Their difference comes only from hydration. Per-class latency is reported in the JSON artifact.

### Workload

| Parameter | `feed-10k` |
| --- | --- |
| Virtual users | 5, 10, 20 (closed loop) |
| Think time | Uniform 3–8 s after each response; start times are staggered |
| Warm-up | 60 s (warm cache only) |
| Measurement | 240 s per run |
| Repetitions | 3 per strategy, cache state, and VU level (36 runs) |
| Personas per 10 VUs | 5 returning users with an interest vector, 2 logged-in users without one, 3 anonymous visitors (half without location) |
| Views | Home 60%, category filter 15%, type filter 10%, tinder deck 15% (location required); 60% chance to scroll to the next page, up to page 5 |
| Page size | 12 (home), 50 (tinder), matching the client |

Semantic search is excluded because it needs query embeddings; it belongs to a separate search profile. Logged-in personas use sessions that the profile writes to the benchmark cache Redis for fixture users. These sessions are deleted after the run.

Each repetition sends both strategies the same seeded request sequence and think times. The strategy that runs first alternates between repetitions to offset drift. The API's in-memory caches are reset before every run:

- **Cold cache**: measurement starts right after the reset, with no warm-up.
- **Warm cache**: the same strategy and workload run for the warm-up period, and those requests are discarded.

The MySQL buffer pool is not reset. The fixture fits in memory and is warm from loading.

### Results

For each run, the JSON artifact keeps the raw successful latencies, failed requests, and a summary: nearest-rank p50/p95/p99, request rate, error rate, response bytes, and a per-request-class breakdown. Each scenario reports the median of these values across repetitions and the current strategy's percentage change against the baseline.

Resource observations cover the measurement window of each run:

| Source | Metrics |
| --- | --- |
| MySQL `SHOW GLOBAL STATUS` | Queries, selects, InnoDB rows read, buffer pool read requests and disk reads, bytes sent, temporary tables, sort rows, slow queries, connections at end |
| MySQL `performance_schema` | Statement count, total statement latency, rows examined and sent |
| Redis cache and vector `INFO` | Commands, keyspace hits and misses, used memory at end |
| API `/health` | Process CPU time and percent of one core, peak RSS and heap (sampled every 5 s) |
| Feed caches | Candidate vector lookups, cache hit rate, Redis reads, failures, missing vectors, cache sizes |

Global counters include the runner's own few snapshot queries. Metrics that are not collected, such as MySQL and Redis server CPU and memory, are listed with a reason under `result.unavailableMetrics`. `performance_schema` requires the read grant in `server/db/benchmark-marker.sql`. Existing benchmark volumes need `make benchmark-reset` to apply it.

The run fails (exit code 1, artifacts still written) if any request returns an error, any response did not apply the requested strategy, or any candidate vector read failed. A relative claim such as "reduced p95 by X%" should come only from a passing `feed-10k` run on hardware that matches production.

## Artifacts

Each run writes one JSON artifact and one Markdown summary named `<profile>-<timestamp>`. A profile can provide its own Markdown result section in place of the full result JSON. If any invariant fails, the runner still writes both artifacts but exits with code 1. The JSON artifact is canonical and contains:

- timestamp, commit SHA, whether the working tree was dirty, runner version, and profile name
- verified target URL, or `null` for profiles that do not touch a target
- host, detected automatically: OS, CPU model and count, memory, Node version, the EC2 instance type and region when running on EC2 (through IMDSv2, otherwise `null`), and the CPUs and memory available to Docker. On macOS, containers are limited by the Docker VM's resources, not the host's. The hostname is deliberately not recorded.
- service versions reported by the profile, e.g. MySQL and each Redis instance
- dataset version and counts
- workload definition
- API/worker replica counts, worker concurrency, and resource limits
- dependency modes and cost metadata
- invariants reported by the profile and whether all of them passed
- profile result data

Absolute latency and throughput depend on the host, so only numbers from an EC2 instance that matches production (and is separate from it) should be quoted as capacity. Development-machine runs are for building and debugging profiles, and for relative comparisons made under identical conditions.

Artifacts are written outside the repository by default. Commit only curated result summaries. Do not include credentials, production connection strings, or personal data in metadata or results.
