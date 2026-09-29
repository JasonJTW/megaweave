# E2E environment

Playwright E2E tests run against an isolated stack that never touches production data or real third-party accounts. It uses its own ports and volumes, so it can run alongside the dev and benchmark stacks.

```bash
make e2e-up   # start MySQL, Redis, and the S3 mock; write the isolation markers
make e2e      # run Playwright (client/playwright.config.ts)
```

`make e2e` needs nothing else running. Playwright:

1. Starts the OpenAI mock, API, worker, and client (reusing any that are already running locally).
2. Runs `npm run e2e:seed` to wipe all data and create the test account (`seed` project).
3. Signs in once through the API and saves the session (`setup` project).
4. Runs the specs in Desktop Chrome, Mobile Chrome, and Mobile Safari.

To run a piece by hand:

```bash
cd server
npm run e2e:seed         # reset data + test account
npm run e2e:mock-openai  # OpenAI embeddings mock on 127.0.0.1:28090
npm run e2e:api          # API on https://localhost:8543
npm run e2e:worker       # BullMQ worker
cd ../client
npm run dev:e2e          # client on https://localhost:3100 (build dir .next-e2e)
```

## Services

| Service | Image | Host port | Notes |
| --- | --- | --- | --- |
| MySQL | `mysql:8.0` | `127.0.0.1:23306` | Database `megaweave_e2e`; initialized from `server/db/schema.sql`, `reference-data.sql`, and `isolated-marker.sql` |
| Redis cache | `redis:7-alpine` | `127.0.0.1:26379` | Not persisted |
| Redis queue | `redis:7-alpine` | `127.0.0.1:26380` | Not persisted |
| Redis vector | `redis/redis-stack-server` | `127.0.0.1:26381` | Not persisted |
| S3 | `adobe/s3mock:5` | `127.0.0.1:29000` (HTTPS, self-signed) | Buckets `megaweave-e2e` and `megaweave-e2e-staging`; supports presigned URLs and CORS, no auth; data lives only in the container |

The S3 mock is served over HTTPS because WebKit blocks uploads from an HTTPS page to an HTTP loopback address. The image-resizer Lambda does not run, so thumbnail URLs return 404; specs assert on the original image instead.

| Command | Effect |
| --- | --- |
| `make e2e-up` | Start the stack and write the Redis markers |
| `make e2e-down` | Stop the stack and keep MySQL data |
| `make e2e-reset` | Delete MySQL data and re-initialize from the schema |
| `make e2e-seed` | Truncate every table except reference data, flush all three Redis instances, rebuild the vector index, and create the test account |

Redis does not persist data, so rerun `make e2e-up` after its containers restart to restore the markers.

## Configuration

`server/e2e.env` and `client/e2e.env` are committed and hold only local addresses, docker credentials, the test account, and fake API keys. `npm run e2e:*` loads `server/e2e.env` with override, so shell variables cannot redirect a run to another database. `npm run dev:e2e` loads `client/e2e.env` before `.env.development`.

| Setting | Value |
| --- | --- |
| Client | `https://localhost:3100`, API `https://localhost:8543`, images from the S3 mock |
| Test account | `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` in `server/e2e.env` |
| OpenAI, S3 | Fake keys; endpoints point to `127.0.0.1` (`OPENAI_BASE_URL`, `AWS_ENDPOINT_URL_S3`) |
| Resend, Lalamove, ECPay, Google | Fake keys or placeholders |

In the browser, `client/e2e/fixtures/base.ts` blocks ads, analytics, Google Maps, Facebook, Sentry, and every `megaweaving.net` host, and skips the first-visit tour.

## Writing specs

| Import `test` from | When |
| --- | --- |
| `e2e/fixtures/base` | Guest pages |
| `e2e/fixtures/auth` | Signed-in pages; the session comes from `auth.setup.ts` |

Give created data a unique name (for example the project name plus `Date.now()`), because the three browser projects run in parallel against the same database.

## Remote targets

Set `E2E_BASE_URL`, `E2E_API_URL`, `E2E_USER_EMAIL`, and `E2E_USER_PASSWORD` to run the specs against a deployed environment. Playwright then starts no servers, skips the data reset, and does not block `megaweaving.net`.

## Safety gates

`make e2e-seed` uses the isolation guard shared with the benchmark runner (`server/src/isolation`) and refuses to modify anything unless every store is marked:

| Store | Marker |
| --- | --- |
| MySQL | table `isolated_environment` containing exactly one row, `megaweave-isolated` |
| Redis cache, queue, vector | key `isolated:environment` = `megaweave-isolated` |

All markers are verified before any data is deleted. Only `docker-compose.e2e.yml` creates them, so a production database or Redis instance cannot pass the check.
