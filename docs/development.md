# Local development

## Prerequisites

- Node.js 20+ and npm
- Docker (Redis, MySQL 8.0 and an S3 mock run in containers)
- [mkcert](https://github.com/FiloSottile/mkcert): the dev server runs over HTTPS with gitignored certificates

Local development never touches production: the database, image storage and email all have local stand-ins. Only the third-party sandboxes (ECPay, Lalamove), OpenAI (use a key with a spending cap) and the Google / Facebook login apps are real services.

## Install

```bash
git clone --recurse-submodules https://github.com/JasonJTW/megaweave.git
cd megaweave
make install
```

Copy the environment templates. Every variable is documented inline, and the defaults already point at the local Docker services; fill in only the third-party keys you need:

```bash
cp server/.env.example server/.env.development
cp client/.env.example client/.env.development
```

## Local services

```bash
make dev-services   # Redis x3, MySQL, S3 mock (make dev and make redis run it too)
make dev-seed       # optional: wipe the dev data and create the test accounts and fixtures
```

| Service | Address | Notes |
| ------- | ------- | ----- |
| Redis cache / queue / vector | `localhost:6379` / `6380` / `6381` | Redis Insight on `http://localhost:8001` |
| MySQL 8.0 | `127.0.0.1:3307`, database `megaweave_dev`, user and password `megaweave` | Created from `server/db/schema.sql` and `reference-data.sql` when the volume is new |
| S3 mock (`adobe/s3mock`, as in E2E) | `http://127.0.0.1:9000` (HTTPS, self-signed: `127.0.0.1:9443`) | Buckets `megaweave-dev` and `megaweave-dev-staging`; no auth, anonymous reads |

- **Email**: `EMAIL_TRANSPORT=log` makes the email job print the recipient and subject instead of calling Resend. Leave it unset (or `resend`) to send for real; `log` is refused when `NODE_ENV=production`.
- **Images**: the AWS SDK reads `AWS_ENDPOINT_URL_S3`, so the server talks to the mock without code changes, and `CLOUDFRONT_URL` / the client's `NEXT_PUBLIC_CLOUDFRONT_CDN` serve images from it. The client's `E2E_IMAGE_ORIGIN` (same variable as the E2E stack) allows `next/image` to load from the mock. Use `127.0.0.1`, not `localhost`: the SDK only uses path-style URLs for IP endpoints. The image-resizer Lambda does not run, so thumbnails 404 and avatar effects (`NEXT_PUBLIC_PROCESS_HOSTNAME`) are unavailable.
- **Safari**: WebKit blocks uploads from an HTTPS page to an HTTP loopback address. Point the S3 variables at `https://127.0.0.1:9443` instead and set `NODE_TLS_REJECT_UNAUTHORIZED=0` for the server and client, which also turns off certificate checks for every outbound call (OpenAI, ECPay, Lalamove), so prefer Chrome or Firefox.
- **Seed data**: `make dev-seed` runs the E2E seed (`server/src/scripts/e2eSeed.ts`) against the dev stores, using the `E2E_*` accounts from `server/.env.development`. It only runs against stores that carry the isolation marker that `docker-compose.dev.yml` and `make dev-services` write, so it can never wipe production.
- **Reset**: `make dev-db-reset` deletes the MySQL, S3 and Redis volumes and reinitialises them; `make redis-stop` stops the containers and keeps the data.

`schema.sql` is always current. An existing database is upgraded by applying the files in `server/db/migrations/` that it has not run yet, in version order (dbmate, ADR 0009); `make dev-db-reset` rebuilds the dev database from the current schema instead.

## Local HTTPS

`server/cert/` is gitignored, so generate a certificate and trust the local CA:

```bash
mkcert -install
mkdir -p server/cert
mkcert -cert-file server/cert/localhost.crt -key-file server/cert/localhost.key localhost 127.0.0.1 ::1
```

`server/.env.example` already sets `ENABLE_HTTPS=true`, `CERT_PATH=../cert/localhost.crt` and `KEY_PATH=../cert/localhost.key`; both paths resolve relative to the entrypoint directory (`server/src/` in dev, `server/dist/` in production). Leave `PASSPHRASE` unset; mkcert emits an unencrypted key. The frontend provisions its own pair into `client/certificates/` via `next dev --experimental-https`. To skip TLS entirely, set `ENABLE_HTTPS=false` and adjust the client's `NEXT_PUBLIC_HOSTNAME` and the server's `CORS_ORIGINS` to match.

## Run

```bash
make dev          # local services, then client, server and worker in one terminal
```

Or one process per terminal:

```bash
make dev-services # Redis, MySQL, S3 mock
make dev-server   # API on :8443
make dev-client   # Next.js on :3000
```

The app is at **https://localhost:3000**. `make dev-server` starts the API alone, matching production's split topology — run `cd server && npm run dev:worker` in a second terminal to process jobs, or run `cd server && npm run dev:inline` instead of `make dev-server` for a single-process loop (sets `RUN_WORKERS_INLINE=true`).

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
server/db               schema.sql, reference-data.sql, migrations/ (ALTERs for existing databases)
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
