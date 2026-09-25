<div align="left">
  <img src="client/public/icons/weaving.svg" alt="Megaweaving" width="160">
  <h1>Megaweaving</h1>
  <p><strong>A free item-exchange and materials-sharing platform.</strong><br>
  Post what you have or what you need, get matched, and complete a real-world exchange.</p>
  <p><a href="https://megaweaving.net"><strong>megaweaving.net</strong></a> · Soft launch · Built and operated solo — product, backend, frontend, infrastructure</p>
</div>

<!-- TODO(screenshots): docs/screenshots/
     1. swipe-to-feed.gif — swipe 5 cards of one category, return home, feed shifts to that category
     2. weave-realtime.gif — split screen: A requests a Weave in chat, B sees it live and accepts
     3. feed.png / multi-item-post.png / delivery.png — static, production data, SandboxPanel hidden -->

<p align="center">
  <img src="docs/screenshots/swipe-to-feed.gif" width="49%" alt="Swiping updates the personalized feed">
  <img src="docs/screenshots/weave-realtime.gif" width="49%" alt="A Weave request arriving in real time">
</p>

Megaweaving grew out of an 11k-member [Facebook group](https://www.facebook.com/groups/1596603907320118) where exchanges were buried in an unsearchable timeline. Users publish a **Share** ("I have this, take it") or a **Wish** ("I'm looking for this"); the other side opens a **Weave** — one exchange, tracked from request until both parties confirm the handover. The exchange itself is free; the only paid path is optional courier delivery.

<p align="center">
<img width="3230" height="1955" alt="system-architecture" src="https://github.com/user-attachments/assets/69f80a9b-c514-46c2-949a-f63a1415f91e" />
</p>

## Features

- **Personalized feed** — semantic retrieval over a Redis HNSW vector index, re-ranked by relevance, popularity, and distance, with a trending fallback for new users.
- **Semantic search** — finds posts by meaning, not just keywords, narrowed by category, location, and radius.
- **Swipe discovery** — every swipe feeds back into the user's interest profile.
- **Weaves** — request → approve → dual confirm → complete, down to individual items within a post.
- **Real-time** — chat, notifications, and Weave updates over Socket.IO with a Redis adapter.
- **Delivery & payment** — Lalamove courier booking paid through ECPay, with a reconciliation job for lost webhooks.
- **Auth** — email, Google, and Facebook sign-in; session-based RBAC.

## Design decisions

**Three Redis instances, three eviction policies.** Cache, job queue, and vector index have conflicting needs: the cache may evict, the other two must not. Splitting them means memory pressure on the cache can never drop queued jobs or embeddings that cost money to rebuild — which matters when everything shares one small instance.

**Feed ranks first, hydrates last.** Candidates are scored on lightweight columns only; the expensive multi-table join runs for just the ~12 posts on the current page. The pre-optimization path is kept behind a flag so both can be benchmarked against each other.

**Heavy work stays off the request path.** API and worker ship as one image with different roles; 7 BullMQ queues handle embeddings, image processing, email, ranking updates, and delivery reconciliation, so a slow OpenAI call never blocks a request and each side scales on its own.

**Degrades instead of failing.** If the embedding API or vector index is unavailable, search falls back to keyword matching; if the trending cache is empty, the feed reads straight from MySQL. If Redis loses the vector index, it rebuilds from MySQL on boot. If a courier webhook never arrives, a reconciliation job catches the order.

<!-- TODO(benchmark): add feed p95 (optimized vs baseline) once soft-launch benchmarks are run -->

## Tech stack

| Layer    | Stack                                                                                     |
| -------- | ----------------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Radix UI, SWR, Framer Motion |
| Backend  | Node.js, Express, TypeScript, Socket.IO, BullMQ, Zod                                      |
| Data     | MySQL 8, Redis 7, Redis Stack (RediSearch + HNSW vectors)                                 |
| Services | AWS S3 + CloudFront + Lambda, OpenAI embeddings, Resend, ECPay, Lalamove, Google Maps     |
| Infra    | Terraform ([infra repo](https://github.com/JasonJTW/Megaweaving-infra)), Docker Compose, GitHub Actions → GHCR → EC2, Sentry |

## Testing

53 Jest suites, focused on what is expensive to get wrong: payment signing and callback verification, courier API auth, RBAC, distributed rate limiting, Weave state transitions, worker shutdown, and equivalence between the optimized and baseline feed.

```bash
make test
```

## Running locally

```bash
git clone --recurse-submodules https://github.com/JasonJTW/megaweave.git
cd megaweave && make install
make redis        # three Redis instances
make dev-server   # API on :8443 (separate terminal)
make dev-client   # Next.js on :3000 (separate terminal)
```

Full setup (database, environment, local HTTPS): [`docs/development.md`](docs/development.md).

## Further reading

- [`CONTEXT.md`](CONTEXT.md) — domain vocabulary: Share, Wish, Weave, Giver/Receiver
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`docs/development.md`](docs/development.md) — local setup, API surface, project layout
- [`docs/deployment.md`](docs/deployment.md) — CI/CD and production stack
- [`docs/benchmark-runner.md`](docs/benchmark-runner.md) — load testing
