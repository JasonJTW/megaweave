# Project Instructions

## Tech Stack
- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Radix UI, SWR, Socket.io-client, Sentry
- **Backend**: Node.js, Express 4, TypeScript, Socket.IO (Redis adapter), MySQL2 (connection pool), Redis Stack (JSON + Vector Search HNSW), BullMQ
- **Third-Party Services**: AWS S3 (image storage), Resend (transactional email), OpenAI (text embeddings), ECPay (AIO payment gateway), Lalamove (delivery dispatch & tracking)
- **Tooling**: Docker Compose, ESLint 9/10 (Flat config), Prettier, Jest + ts-jest

## Code Style
- **Naming**:
  - Components: PascalCase (`MemberCard.tsx`, `AddToCart.tsx`)
  - Hooks: camelCase with `use` prefix (`useAuth.ts`, `useSocket.ts`)
  - Services/Utils: camelCase (`postService.ts`, `locationService.ts`)
  - Types/Interfaces: PascalCase (`CreatePostInput`, `UserSession`)
- **Validation**: Strict schema validation with Zod (`zod`) on incoming API payloads and environment variables.
- **Error Handling**: Route handlers wrap every `await` in `try/catch` and hand errors to the Express error middleware with `return next(error)` (Express 4 doesn't forward async rejections). Expected 4xx errors use `return next(new HttpError(status, code, message))` (`server/src/utils/httpError.ts`); `errorMiddleware` responds `{ code, errorMessage[, params] }` and never leaks internals on 5xx. Don't write `res.status(4xx/5xx).json(...)` in routes (exceptions: ECPay callback and Lalamove webhook protocol responses, dev-only `/sandbox/*`).
- **API Error Codes**: `server/src/utils/errorCodes.ts` is the single source. A new code needs a translation in the client `Errors` namespace (both locales; `client/__tests__/errorCodes.test.ts` enforces it). The client shows `translateApiError` / `useApiErrorMessage` output, never `errorMessage`. Validation: data the user typed into a form fails with `next(zodError)` → `VALIDATION_FAILED` ("check your input"); IDs, query params and other client-generated payloads fail with `INVALID_REQUEST` ("refresh and try again" — it means a client bug).
- **Database**: Parameterized raw SQL queries via `mysql2/promise` with transactions for multi-step mutations. Never interpolate untrusted values directly into SQL strings.

## Architecture Decisions
- **ADRs** (`docs/adr/`, vocabulary in `CONTEXT.md`) record deliberate choices that look like bugs. Before changing or reviewing code that touches a decision's subject (weave giver/receiver, locale routing, org membership and audience tier, the `main` merge policy), read the matching ADR.

## Review Standards
The CI review workflows apply `docs/agents/code-review.md` and `docs/agents/security-review.md`. Read them before reviewing a change; touching routes, auth, webhooks, secrets or workflows also needs the security one.

## Testing
- Run tests: `make test` or `cd server && npm test`
- Single test: `cd server && npx jest path/to/file.test.ts`
- Test pattern: Unit and integration tests colocated or in `__tests__/` with `*.test.ts` naming.
- Force exit: `--forceExit` is configured in Jest for async handles/connections.

## Build & Run
- **Dev**:
  - All at once: `make dev` starts Redis, then client, server and worker in one terminal (`concurrently`, prefixed output); Ctrl+C stops all three, Redis keeps running (`make redis-stop`)
  - Redis: `make redis` (or `docker compose -f docker-compose.dev.yml up -d`)
  - Backend: `make dev-server` (or `cd server && npm run dev`) — runs nodemon with HTTPS/HTTP on port 8443
  - Frontend: `make dev-client` (or `cd client && npm run dev`) — Next.js dev server on port 3000
- **Typecheck**: `make typecheck` (runs `tsc --noEmit` across client and server)
- **Lint**: `make lint` / `make lint-fix` (ESLint on client and server)
- **Build**: `make build` (production build) or `make build-dev` (development build)

## Worktrees & Git Hooks
- `npm run setup:worktree` (repo root): links the main checkout's `.env*` files and localhost certificates into a worktree, then runs `npm ci` in the root, `client/` and `server/`. Run it in any worktree missing them. Every worktree gets its own `node_modules`; never symlink one.
- T3 Code runs that script on worktree creation once the user imports it from `t3.json` by hand: Settings → Projects → project → Actions → **Import scripts**. Remind them once.
- `lefthook.yml` (installed by the root `npm ci`): pre-commit formats `client/` with Prettier, runs ESLint `--fix` on staged files, then `make typecheck` and `make test`. Pre-push refuses pushes to `main`, then runs `make e2e-up && E2E_BUILD=1 make e2e` against the production build, as CI does (needs Docker). Worktrees share one E2E stack, so `make e2e` waits for another worktree's run to finish (`scripts/e2e-lock.sh`). Fix failures; never bypass a hook with `--no-verify`.

## Pull Requests
- Changes reach `main` only through a PR. The `main` ruleset requires `E2E (Playwright)`, `Claude Code Review` and `Claude Security Review` to pass; a Claude review fails the check when it posts a blocking finding (`docs/agents/*.md` define blocking). Only merge commits are allowed.
- The ruleset and merge settings live on GitHub, not in git: `npm run setup:repo` applies `scripts/main-ruleset.json` (needs `gh` with admin rights; safe to re-run). If you add or rename a required job, update that file and re-run it.
- After opening a PR, enable auto-merge: `gh pr merge --auto --merge <PR>`. GitHub merges it once the required checks pass. Skip this for draft PRs, or when the user says to hold the merge.
- The ruleset requires a PR to be up to date with `main`, so it is verified on the latest `main` before merging. When `main` moves or a PR turns on auto-merge, `update-auto-merge-branches.yml` merges `main` into every auto-merge PR (pushing with the `AUTO_UPDATE_TOKEN` PAT so the checks run again). A PR that conflicts with `main` needs a manual merge.
- If auto-merge stalls on a failing check, fix the failure and push. Never merge manually past a red check.

## Project Structure
- `client/app/`: Next.js App Router pages, layouts, and route handlers
- `client/components/`: Modular React components and Radix UI primitives
- `client/contexts/`: React context providers (Auth, Socket, Notification, Weave)
- `server/src/api.ts`: Central Express router aggregator
- `server/src/services/`: Core domain business logic (posts, feeds, payments, logistics)
- `server/src/queue/`: BullMQ queues and worker job definitions
- `server/src/utils/`: Database pool, Redis client, Socket.IO, S3 storage helpers
- `services/image-resizer/`: AWS Lambda handler for automatic S3 image resizing via Sharp

## Conventions
- **Commits**: Conventional Commits style (`feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `perf(scope): ...`).
- **Real-time Updates**: Socket.IO events for live notifications, chat, and Lalamove driver tracking.
- **Async Processing**: Heavy tasks (OpenAI embeddings, email dispatch, S3 uploads/deletions, hot score crons) must be deferred to BullMQ queues.
