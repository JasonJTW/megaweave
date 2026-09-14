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
- **Error Handling**: Explicit `try/catch` blocks in controllers/services with typed error handling and consistent HTTP error responses (`res.status(500).json({ errorMessage: ... })`).
- **Database**: Parameterized raw SQL queries via `mysql2/promise` with transactions for multi-step mutations. Never interpolate untrusted values directly into SQL strings.

## Testing
- Run tests: `make test` or `cd server && npm test`
- Single test: `cd server && npx jest path/to/file.test.ts`
- Test pattern: Unit and integration tests colocated or in `__tests__/` with `*.test.ts` naming.
- Force exit: `--forceExit` is configured in Jest for async handles/connections.

## Build & Run
- **Dev**:
  - Redis: `make redis` (or `docker compose -f docker-compose.dev.yml up -d`)
  - Backend: `make dev-server` (or `cd server && npm run dev`) — runs nodemon with HTTPS/HTTP on port 8443
  - Frontend: `make dev-client` (or `cd client && npm run dev`) — Next.js dev server on port 3000
- **Typecheck**: `make typecheck` (runs `tsc --noEmit` across client and server)
- **Lint**: `make lint` / `make lint-fix` (ESLint on client and server)
- **Build**: `make build` (production build) or `make build-dev` (development build)

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
