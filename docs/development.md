# Local development

## Prerequisites

- Node.js 20+ and npm
- Docker (for the three Redis instances)
- A MySQL 8 instance
- [mkcert](https://github.com/FiloSottile/mkcert) — the dev server runs over HTTPS with gitignored certificates

## Install

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

## Local HTTPS

`server/cert/` is gitignored, so generate a certificate and trust the local CA:

```bash
mkcert -install
mkdir -p server/cert
mkcert -cert-file server/cert/localhost.crt -key-file server/cert/localhost.key localhost 127.0.0.1 ::1
```

Then set `ENABLE_HTTPS=true`, `CERT_PATH=../cert/localhost.crt`, and `KEY_PATH=../cert/localhost.key` — both paths resolve relative to the entrypoint directory (`server/src/` in dev, `server/dist/` in production). Leave `PASSPHRASE` unset; mkcert emits an unencrypted key. The frontend provisions its own pair into `client/certificates/` via `next dev --experimental-https`. To skip TLS entirely, set `ENABLE_HTTPS=false` and adjust `NEXT_PUBLIC_API_HOST` and `CORS_ORIGINS` to match.

## Run

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

## Tests

```bash
make test                                      # all server suites
cd server && npx jest src/services/feedService.test.ts
```

## Background jobs

| Queue                | Job                 | Notes                                                        |
| -------------------- | ------------------- | ------------------------------------------------------------ |
| `post-image`         | upload / delete     | S3 writes and deletions, 5 attempts with exponential backoff |
| `post-embedding`     | generate-embedding  | OpenAI embedding → MySQL + Redis vector index                |
| `user-vector`        | update-user-vector  | Incremental interest vector from user interactions           |
| `user-vector-flush`  | flush-user-vectors  | Batched persistence of buffered user vectors                 |
| `hot-score`          | calculate-hot-score | Repeatable cron recomputing feed ranking scores              |
| `email`              | send-email          | Resend delivery of React Email templates                     |
| `delivery-reconcile` | reconcile-orders    | Catches Lalamove orders whose webhook was lost               |

## API surface

All routes are mounted under `/api` ([`server/src/api.ts`](../server/src/api.ts)).

| Prefix                                           | What it covers                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `/signup`, `/signin`, `/signout`, `/currentUser` | Auth and session lifecycle                                                  |
| `/posts`, `/posts/feed`                          | Post CRUD and the personalized feed                                         |
| `/weaves`                                        | Create, list, and transition weaves; `/weaves/public/:uuid` for share links |
| `/comments`, `/like`, `/user/stats`              | Engagement                                                                  |
| `/messages`, `/send`, `/notifications`           | Chat and notifications                                                      |
| `/member`, `/userprofile`, `/avatar`, `/me`      | Profiles                                                                    |
| `/categories`, `/conditions`                     | Reference data                                                              |
| `/lalamove`, `/payments`                         | Quotations, checkout, payment callbacks, delivery webhooks                  |
| `/admin`                                         | Metrics and cleanup (`admin` role only)                                     |
| `/health`                                        | Liveness                                                                    |

## Project layout

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

## Benchmarking

Load profiles run only against a fully isolated stack. See [`benchmark-runner.md`](benchmark-runner.md).

```bash
make benchmark-up
cd server && BENCHMARK_ENVIRONMENT=isolated npm run benchmark -- --profile <name> --target http://localhost:18443
```
