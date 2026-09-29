# E2E environment

Playwright E2E tests run against an isolated stack that never touches production data or real third-party accounts. It uses its own ports and volumes, so it can run alongside the dev and benchmark stacks.

```bash
make e2e-up      # start MySQL + Redis and write the isolation markers
make e2e-seed    # wipe all data and create the E2E test account
cd server
npm run e2e:api     # API on https://localhost:8543
npm run e2e:worker  # BullMQ worker
```

## Services

| Service | Image | Host port | Notes |
| --- | --- | --- | --- |
| MySQL | `mysql:8.0` | `127.0.0.1:23306` | Database `megaweave_e2e`; initialized from `server/db/schema.sql`, `reference-data.sql`, and `isolated-marker.sql` |
| Redis cache | `redis:7-alpine` | `127.0.0.1:26379` | Not persisted |
| Redis queue | `redis:7-alpine` | `127.0.0.1:26380` | Not persisted |
| Redis vector | `redis/redis-stack-server` | `127.0.0.1:26381` | Not persisted |

| Command | Effect |
| --- | --- |
| `make e2e-up` | Start the stack and write the Redis markers |
| `make e2e-down` | Stop the stack and keep MySQL data |
| `make e2e-reset` | Delete MySQL data and re-initialize from the schema |
| `make e2e-seed` | Truncate every table except reference data, flush all three Redis instances, rebuild the vector index, and create the test account |

Redis does not persist data, so rerun `make e2e-up` after its containers restart to restore the markers.

## Configuration

`server/e2e.env` is committed and holds only local docker credentials, the test account, and fake API keys. `npm run e2e:*` loads it with override, so shell variables cannot redirect a run to another database.

| Setting | Value |
| --- | --- |
| API | `https://localhost:8543` (`CORS_ORIGINS=https://localhost:3100` for the E2E client) |
| Test account | `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` |
| OpenAI, S3 | Fake keys; endpoints point to `127.0.0.1` (`OPENAI_BASE_URL`, `AWS_ENDPOINT_URL_S3`) |
| Resend, Lalamove, ECPay, Google | Fake keys or placeholders |

## Safety gates

`make e2e-seed` uses the isolation guard shared with the benchmark runner (`server/src/isolation`) and refuses to modify anything unless every store is marked:

| Store | Marker |
| --- | --- |
| MySQL | table `isolated_environment` containing exactly one row, `megaweave-isolated` |
| Redis cache, queue, vector | key `isolated:environment` = `megaweave-isolated` |

All markers are verified before any data is deleted. Only `docker-compose.e2e.yml` creates them, so a production database or Redis instance cannot pass the check.
