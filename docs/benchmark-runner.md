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

   `queue-burst-*` profiles also enqueue jobs and drain leftover jobs, so they require the same marker in the queue Redis, and refuse to run unless `OPENAI_BASE_URL` and `AWS_ENDPOINT_URL_S3` point to a mock on `127.0.0.1` with an explicit port.

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
| `queue-burst-500` | Yes | Yes | Loads the 10k fixture, then injects 500 post/interaction units (1,500 image, embedding, and user-vector jobs) while feed and post-creation traffic continues, with the typical source image mix (about 6 minutes plus fixture load and drain) |
| `queue-burst-500-raw` | Yes | Yes | Same as `queue-burst-500`, but every upload is an uncompressed photo; the worst case for the image worker |
| `queue-burst-1k-smoke` | Yes | Yes | Same flow on the 1k fixture with 50 units and short phases (about 2 minutes); for checking the profile, not for results |

```bash
cd server
BENCHMARK_ENVIRONMENT=isolated \
BENCHMARK_API_REPLICAS=1 \
BENCHMARK_WORKER_REPLICAS=1 \
BENCHMARK_RESOURCE_LIMITS='{"api":"1 vCPU / 2 GB","worker":"1 vCPU / 2 GB"}' \
npm run benchmark -- --profile environment-check --output /tmp/megaweave-benchmark
```

Future tickets add the recovery profiles to the same registry.

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

## Queue burst profiles

`queue-burst-500` measures asynchronous capacity and its user-facing impact. It injects representative post-image, post-embedding, and user-vector work while low, continuous feed and post-creation traffic runs through the public API. It reports queue wait and processing distributions, completed work, retries, terminal failures, peak depth, time to zero backlog, and feed and post-creation latency before, during, and after the burst.

### Running

The profile needs both an API and a worker connected to the benchmark data stores:

```bash
make benchmark-up
cd server
npm run benchmark:api      # terminal 1: http://localhost:18443
npm run benchmark:worker   # terminal 2: builds, then runs the standalone worker with server/benchmark.env
# terminal 3
BENCHMARK_ENVIRONMENT=isolated BENCHMARK_API_REPLICAS=1 BENCHMARK_WORKER_REPLICAS=1 \
BENCHMARK_WORKER_CONCURRENCY='{"post-image":2,"post-embedding":2,"user-vector":5}' \
BENCHMARK_RESOURCE_LIMITS='{"api":"1 vCPU / 2 GB","worker":"1 vCPU / 2 GB"}' \
  npm run benchmark -- --profile queue-burst-500 --target http://localhost:18443
```

Start the API first. Both scripts compile to `dist/`, so running them at the same time can fail. The profile fails before loading the fixture if no worker is consuming `post-image`, `post-embedding`, or `user-vector`. Leftover unprocessed jobs from an interrupted run are drained before the fixture is reloaded. The worker needs no restart between runs.

Replica counts, worker concurrency, and resource limits in the artifact header come from the operator variables above. The result also records the per-process concurrency configured in code and the worker connections the profile observed per queue, so a mismatch with the declared values is visible.

### Mocked dependencies

OpenAI and S3 are replaced by loopback mocks that the runner starts for the duration of the run. `server/benchmark.env` points the API and the worker at them through the standard SDK variables, so the production code paths (OpenAI SDK, AWS SDK, and sharp) run unchanged:

| Service | Variable | Mock behavior |
| --- | --- | --- |
| OpenAI embeddings | `OPENAI_BASE_URL=http://127.0.0.1:18090/v1` | Deterministic 1536-dimension unit vector per input text, 150–450 ms latency |
| S3 | `AWS_ENDPOINT_URL_S3=http://127.0.0.1:18091` | In-memory path-style GetObject / PutObject / DeleteObject and presigned uploads, 20–80 ms latency |

`benchmark.env` also sets placeholder credentials, so an API or worker started with it can never reach the real services. When the mocks are not running, those calls fail. The artifact records the dependency modes as `openai: mock` and `s3: mock`. The throughput therefore measures the worker, MySQL, and Redis, not OpenAI or S3 capacity.

### Workload

| Parameter | `queue-burst-500` |
| --- | --- |
| Burst units | 500. Each unit is one new post with 1–5 staged images (35/25/20/10/10%) and one interaction by a fixture user on an embedded fixture post (view 55%, like 30%, comment 10%, weave 5%) |
| Jobs | 1 `upload-images`, 1 `generate-embedding`, and 1 `update-user-vector` per unit (1,500 total) |
| Injection | Spread evenly over 30 s, using the production enqueue helpers (same job names, delays, attempts, and backoff) |
| Source images | Each image draws a variant from the profile's mix (see below). Burst and post-creation uploads use the same mix |
| Feed traffic | 5 closed-loop virtual users, 3–8 s think time. Personas and view mix as in `feed-10k`. Production default strategy |
| Post-creation traffic | 2 closed-loop virtual users, 20–40 s think time. Each creates a post the way the client does: presigned URLs, then a PUT of each image to the mock S3, then `POST /api/posts` |
| Phases | `before`: 120 s of traffic only. `burst`: from the first enqueue until every burst job is terminal (30-minute limit). `after`: 120 s of traffic after the backlog clears |
| Depth sampling | Every 1 s |

Source image mixes. The client compresses photos to at most 1200 px before upload (`client/utils/imageProcessor.ts`): WebP where the browser can encode it, JPEG otherwise (iOS Safari), and the original photo when compression fails or times out. The worker only reads the metadata of a WebP image of at most 1200 px and resizes and re-encodes everything else, so the mix sets the image worker's CPU cost:

| Variant | Image | Worker work | `queue-burst-500` | `queue-burst-500-raw` |
| --- | --- | --- | ---: | ---: |
| `client-webp` | 1200×900 WebP, quality 85 | Metadata only | 50% | 0% |
| `client-jpeg` | 1200×900 JPEG, quality 85 | Re-encode to WebP | 30% | 0% |
| `raw` | 2048×1536 JPEG, quality 85 (about 1 MB) | Resize and re-encode to WebP | 20% | 100% |

The typical shares are an assumption, not a production measurement. Update `TYPICAL_IMAGE_MIX` in `server/src/benchmark/queue/imageMix.ts` once real upload formats are known. The artifact records the mix, each variant's size and hash, and the staged burst images per variant.

Burst posts, items, and image rows are written to MySQL, and their staging images are placed in the mock S3, before measurement starts. This matches the state a committed `createPost` leaves. The burst therefore measures the queue and the worker, not API write capacity, which the post-creation traffic covers. Interactions never repeat a (user, post, action) triple, so the producer's cooldown does not drop any of them.

### Results

Job lifecycles come from the BullMQ event stream (`QueueEvents`), timestamped by the queue Redis clock. Every submitted job is accounted for as completed, terminally failed, unfinished, or never observed. Jobs that the API enqueued for created posts are reported separately as traffic jobs.

| Metric | Definition |
| --- | --- |
| Queue wait | First start minus enqueue. Includes the producer's scheduled delay (100 ms for images, 500 ms for embeddings) |
| Processing | Finish minus start of the final attempt |
| Retries | Attempts beyond the first, including re-processing after a stall |
| Terminal failure | A job that exhausted its attempts |
| Peak depth | Maximum sampled waiting + delayed + prioritized + active jobs, per queue and in total |
| Time to zero backlog | From the last burst enqueue until the last burst job reached a terminal state. The first sampled zero depth after injection, which includes traffic jobs, is reported alongside |
| Completed/hour | Completed jobs divided by the time from first enqueue to last terminal job |

User-facing results are summarized per phase and per traffic group (`feed` and `post-creation`), with the same statistics as the feed profiles and each phase's p95 change from `before`. The post-creation workload is deliberately low (about 8 API calls per 120 s phase), so its percentiles indicate direction only. The summary flags every phase and group with fewer than 100 successful requests. MySQL, Redis, and API process observations are recorded per phase, as in the feed profiles. The artifact also records the per-process queue concurrency configured in `server/src/queue/concurrency.ts`, the worker connections observed per queue, and the mock request counts. Worker CPU and memory are not sampled; use `docker stats` or `ps` alongside the run.

After the run, the profile checks durable outcomes for every burst post and every post created by the traffic:

- a completed embedding job left a 1536-dimension `posts.embedding` and a Redis `post:{id}` vector
- a completed image job uploaded every image key to the mock S3 and deleted its staging object
- each post has exactly as many image rows as uploaded images
- a completed user-vector job rewrote `user:{id}:vector` after the burst started. This is checked per user, so when one user has several burst interactions, one rewrite satisfies all of them

Repeated uploads of the same key are counted but allowed, because a retried image job re-uploads idempotently. Posts created by the traffic are checked only when every traffic job finished without a terminal failure; otherwise the run already fails.

The run fails (exit code 1, artifacts still written) if any burst job is unfinished or was never observed, if any job enqueued by the traffic did not finish, if any job terminally failed, if a durable outcome is missing or duplicated, if either traffic group had no successful request in a phase, or if any user request failed. Quote capacity only from a passing `queue-burst-500` run on hardware that matches production, together with the replica counts, concurrency, and resource limits in its artifact.

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
