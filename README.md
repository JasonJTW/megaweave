<div align="center">
  <img src="client/public/icons/weaving.svg" alt="Megaweaving" width="160">
  <h1>Megaweaving</h1>
  <p><strong>A free item-exchange and materials-sharing platform.</strong><br>
  Post what you have or what you need, get matched, and complete a real-world exchange.</p>
  <p><a href="https://megaweaving.net"><strong>megaweaving.net</strong></a></p>
</div>

<!-- TODO(screenshots): 這裡放 2–3 張圖，是整份 README 投報率最高的一段。建議：
     1. 個人化 feed（首頁）
     2. Tinder swipe 探索模式
     3. Weave 流程或 Lalamove 即時外送追蹤
     存到 docs/screenshots/ 之後用：
     <p align="center">
       <img src="docs/screenshots/feed.png" width="32%">
       <img src="docs/screenshots/tinder.png" width="32%">
       <img src="docs/screenshots/delivery.png" width="32%">
     </p>
     若有 30 秒操作 GIF，效果比三張靜態圖更好。 -->

Megaweaving started as an 11k-member [Facebook group](https://www.facebook.com/groups/1596603907320118) and is now a searchable, database-driven platform. Users publish a **Share** ("I have this, take it") or a **Wish** ("I'm looking for this"); the other side opens a **Weave** — one complete exchange relationship that lives from the moment the request is made until both parties confirm the handover.

There is no money in the exchange itself. The only paid path is optional Lalamove courier delivery when the two parties can't meet in person.

<!-- TODO(status): 補一段專案現況，面試官第一個問的就是這個。例如：
     "Live in production since <date>. Built and operated solo: product, backend, frontend, infrastructure.
      Currently serving <N> users and <N> posts on a single 1 vCPU / 2 GB instance."
     有真實數字再寫，沒有就先寫角色與上線時間。 -->

## Features

- **Semantic feed** — two-stage retrieval over a Redis HNSW vector index (OpenAI `text-embedding-3-small`, 1536-dim cosine), hybrid re-ranked against a per-user interest vector, hot score, and geographic proximity, with a trending fallback for users who have no vector yet.
- **Weaves** — request → approve → dual confirm → complete, with decline and cancel paths. Item-level granularity: a Weave can cover just part of a post.
- **Tinder-style discovery** — swipe UI over the same feed, updating the user's interest vector as a side effect.
- **Real-time layer** — Socket.IO over a Redis adapter drives chat, notifications, and live Lalamove driver tracking across API replicas.
- **Delivery & payment** — Lalamove quotation → ECPay AIO checkout → order placement → webhook-driven status, plus a reconciliation job for orders whose webhook never arrived.
- **Auth** — native sign-up, Google OAuth, and Facebook login over Redis-backed cookie sessions with server-authoritative RBAC (`user` / `contributor` / `admin`).
- **Async everything** — image processing, embeddings, email, hot-score crons, and user-vector flushes all run off the request path via BullMQ.

## Engineering notes

The constraint that shaped most of this system: it runs on a single **1 vCPU / 2 GB** instance. Vector search, real-time messaging, and background jobs all had to fit in that budget.

**Late materialization in the feed.** Ranking needs cheap columns; rendering needs an expensive six-table JOIN. So the feed retrieves lightweight candidates (`id`, `hot_score`, `lat`, `lng` — no JOINs, no embedding column), re-ranks them in memory against Float32 vectors read from Redis, and only then hydrates the ~12 posts on the current page. Scoring is `0.7 × cosine similarity + 0.3 × normalized hot score`, multiplied by a distance boost. A `fullHydrationBaseline` flag preserves the pre-optimization path so the two can be measured against each other.

**Three Redis instances, not one.** They have incompatible requirements, and a shared instance resolves that conflict by silently dropping something. The cache (sessions, cooldowns, trending) *may* evict under `volatile-lru`; the queue is durable state and runs `noeviction` with AOF; the vector index is `noeviction` because rebuilding it costs real OpenAI spend. Splitting them makes each policy explicit and caps each one's memory on a box that has little to spare.

**The index heals itself.** On boot, `ensureVectorIndexExists()` compares `num_docs` in the HNSW index against the MySQL post count and re-syncs from MySQL if Redis was flushed — behind a distributed lock, so replicas starting together don't duplicate the work.

**One image, two roles.** API and worker ship as the same container with a different `APP_ROLE` (`dist/server.js` vs `dist/worker.js`) and separate DB pool sizes. Embedding generation and image processing can't starve request handling, and either side scales on its own. Locally, `RUN_WORKERS_INLINE=true` collapses both into one process.

**Secrets fail loudly.** `requireEnv()` refuses to start the process when a payment or session secret is missing, rather than falling back to a public sandbox key — with ECPay, that fallback would let anyone forge a valid `CheckMacValue` on a payment callback.

**Benchmarks can't touch production.** The load runner refuses to start unless `BENCHMARK_ENVIRONMENT=isolated` is set, the target's `/health` returns an isolation marker, and marker rows exist inside the benchmark MySQL and Redis. Profiles that call a real external API need a further explicit opt-in, because those calls cost money.

## Architecture

```
┌──────────────┐       ┌────────────────────────────┐       ┌─────────────┐
│  Next.js 16  │◄─────►│  Express API (APP_ROLE=api)│◄─────►│   MySQL 8   │
│  React 19    │  REST │  + Socket.IO gateway       │       │  (mysql2)   │
│  PWA / SWR   │◄─────►│                            │       └─────────────┘
└──────────────┘  WS   └──────────┬─────────────────┘
                                  │ enqueue
                       ┌──────────▼─────────────────┐       ┌─────────────┐
                       │ Worker (APP_ROLE=worker)   │──────►│  S3 · OpenAI│
                       │ BullMQ: images, embeddings,│       │  Resend     │
                       │ email, hot-score, delivery │       │  Lalamove   │
                       └──────────┬─────────────────┘       │  ECPay      │
                                  │                         └─────────────┘
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
      redis-cache:6379    redis-queue:6380    redis-vector:6381
      sessions, Socket.IO  BullMQ (AOF)       RediSearch HNSW
      cooldowns, trending                     post & user vectors
```

Images are handled out of band: uploads land in S3, an S3 event triggers the standalone Lambda in `services/image-resizer/`, and it writes `thumb_` and `medium_` variants back. That Lambda is excluded from both Docker builds and CI path filters.

Full subsystem walkthroughs — feed routing, EMA vector write-back, hot score, Socket.IO, Lalamove, ECPay — are in [`docs/notes/megaweave-system-design.md`](docs/notes/megaweave-system-design.md).

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Radix UI, SWR, Framer Motion, Socket.io-client, Sentry |
| Backend | Node.js, Express 4, TypeScript, Socket.IO + Redis adapter, mysql2 (pooled), BullMQ, Zod |
| Data | MySQL 8, Redis 7 (cache / queue), Redis Stack (RediSearch + HNSW vectors) |
| Services | AWS S3 + CloudFront, OpenAI embeddings, Resend, ECPay AIO, Lalamove, Google Maps |
| Infra | Docker Compose, GHCR images, GitHub Actions → self-hosted EC2 runner |

## Background jobs

| Queue | Job | Notes |
| --- | --- | --- |
| `post-image` | upload / delete | S3 writes and deletions, 5 attempts with exponential backoff |
| `post-embedding` | generate-embedding | OpenAI embedding → MySQL + Redis vector index |
| `user-vector` | update-user-vector | Incremental EMA interest vector from user interactions |
| `user-vector-flush` | flush-user-vectors | Batched persistence of buffered user vectors |
| `hot-score` | calculate-hot-score | Repeatable cron recomputing feed ranking scores |
| `email` | send-email | Resend delivery of React Email templates |
| `delivery-reconcile` | reconcile-orders | Catches Lalamove orders whose webhook was lost |

## Testing

53 Jest suites, concentrated on the parts that are expensive to get wrong: ECPay `CheckMacValue` signing and callback verification, Lalamove request auth, RBAC role resolution, distributed rate limiting, weave status-transition guards, worker lifecycle and shutdown, image storage, and feed-strategy equivalence between the optimized and baseline ranking paths.

```bash
make test                                      # all server suites
cd server && npx jest src/services/feedService.test.ts
```

## Getting started

<details>
<summary><strong>Local setup</strong></summary>

### Prerequisites

- Node.js 20+ and npm
- Docker (for the three Redis instances)
- A MySQL 8 instance
- [mkcert](https://github.com/FiloSottile/mkcert) — the dev server runs over HTTPS with gitignored certificates

### Install

```bash
git clone --recurse-submodules https://github.com/JasonJTW/megaweave.git
cd megaweave
make install
```

Create the database:

```bash
mysql -u <user> -p <database> < server/db/schema.sql
mysql -u <user> -p <database> < server/db/reference-data.sql
```

Copy the environment templates — every variable is documented inline with defaults:

```bash
cp server/.env.example server/.env.development
cp client/.env.example client/.env.development
```

### Local HTTPS

`server/cert/` is gitignored, so generate a certificate and trust the local CA:

```bash
mkcert -install
mkdir -p server/cert
mkcert -cert-file server/cert/localhost.crt -key-file server/cert/localhost.key localhost 127.0.0.1 ::1
```

Then set `ENABLE_HTTPS=true`, `CERT_PATH=../cert/localhost.crt`, and `KEY_PATH=../cert/localhost.key` — both paths resolve relative to the entrypoint directory (`server/src/` in dev, `server/dist/` in production). Leave `PASSPHRASE` unset; mkcert emits an unencrypted key. The frontend provisions its own pair into `client/certificates/` via `next dev --experimental-https`. To skip TLS entirely, set `ENABLE_HTTPS=false` and adjust `NEXT_PUBLIC_API_HOST` and `CORS_ORIGINS` to match.

### Run

```bash
make redis        # cache:6379, queue:6380, vector:6381 (+ Redis Insight on :8001)
make dev-server   # API on :8443
make dev-client   # Next.js on :3000
```

The app is at **https://localhost:3000**. `make dev-server` starts the API alone, matching production's split topology — run `cd server && npm run dev:worker` in a second terminal to process jobs, or set `RUN_WORKERS_INLINE=true` for a single-process loop.

Once posts exist, populate the vector index:

```bash
cd server && npm run sync:vectors
```

</details>

<details>
<summary><strong>API surface and project layout</strong></summary>

All routes are mounted under `/api` ([`server/src/api.ts`](server/src/api.ts)).

| Prefix | What it covers |
| --- | --- |
| `/signup`, `/signin`, `/signout`, `/currentUser` | Auth and session lifecycle |
| `/posts`, `/posts/feed` | Post CRUD and the personalized feed |
| `/weaves` | Create, list, and transition weaves; `/weaves/public/:uuid` for share links |
| `/comments`, `/like`, `/user/stats` | Engagement |
| `/messages`, `/send`, `/notifications` | Chat and notifications |
| `/member`, `/userprofile`, `/avatar`, `/me` | Profiles |
| `/categories`, `/conditions` | Reference data |
| `/lalamove`, `/payments` | Quotations, checkout, ECPay callbacks, delivery webhooks |
| `/admin` | Metrics and cleanup (`admin` role only) |
| `/health` | Liveness, SSL status, benchmark markers |

```
client/                 Next.js App Router frontend, Radix UI primitives, SWR hooks
server/db               schema.sql, reference-data.sql
server/src              Route modules (posts.ts, weaves.ts, payments.ts, ...)
  services/             Feed, embeddings, vector index, payment, lalamove
  queue/                BullMQ queues, workers, job definitions
  middleware/           Auth, RBAC, rate limiting
  utils/                DB pool, Redis clients, Socket.IO, notifications
  benchmark/            Load profiles and isolation markers
services/image-resizer  Standalone AWS Lambda (Sharp) for S3 image variants
```

</details>

<details>
<summary><strong>Benchmarking</strong></summary>

Synthetic load profiles run only against a fully isolated stack, behind several safety gates — `BENCHMARK_ENVIRONMENT=isolated`, an isolation marker in the target's `/health` response, and marker rows inside the benchmark MySQL and Redis instances.

```bash
make benchmark-up    # isolated MySQL:13306 + Redis:16379-16381
cd server && BENCHMARK_ENVIRONMENT=isolated npm run benchmark -- --profile <name> --target http://localhost:18443
```

See [`docs/benchmark-runner.md`](docs/benchmark-runner.md) for profiles, gates, and artifact formats.

> [!CAUTION]
> Never set `BENCHMARK_TARGET_MARKER` in a production environment file. It unlocks benchmark-only endpoints, including cache resets and feed-strategy overrides.

<!-- TODO(benchmark): 跑完之後在這裡放結果表。這是全篇技術含量最高、也最能量化的一段，
     例如 feed p95 latency（late materialization vs full-hydration baseline）、
     每小時 embedding job 吞吐、1 vCPU / 2 GB 下的 RSS 與 CPU。 -->

</details>

## Deployment

Pushes to `main` trigger [`.github/workflows/megaweaving-cicd.yaml`](.github/workflows/megaweaving-cicd.yaml):

1. `dorny/paths-filter` detects whether `server/**` or `client/**` changed.
2. Changed apps are built on GitHub-hosted runners and pushed to GHCR.
3. A self-hosted EC2 runner prunes Docker, writes `.env.production` from secrets, pulls, and restarts containers.
4. Container health is verified, then post-deploy cleanup runs.

Production runs from [`docker-compose.yml`](docker-compose.yml): three Redis instances, `backend-api`, `backend-worker`, and `frontend`. Third-party actions are pinned to commit SHAs and every job declares explicit `GITHUB_TOKEN` permissions.

```bash
make up      # start the production stack
make logs    # tail everything; also logs-api / logs-worker / logs-frontend
make down
```

## Further reading

- [`docs/notes/megaweave-system-design.md`](docs/notes/megaweave-system-design.md) — subsystem deep dives, scaling roadmap, known technical debt.
- [`CONTEXT.md`](CONTEXT.md) — the domain vocabulary. Read this before naming anything: Share, Wish, Commons, Weave, Giver/Receiver vs Initiator/Post Author.
- [`docs/benchmark-runner.md`](docs/benchmark-runner.md) — benchmark profiles and safety gates.
- [`services/image-resizer/README.md`](services/image-resizer/README.md) — Lambda packaging and deployment.
