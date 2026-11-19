# Review workflows

Three PR reviews run on three subscriptions (ADR 0008). All apply the standards in `docs/agents/code-review.md` and `docs/agents/security-review.md`, return a `{blocking, summary}` verdict, and fail their check only on a blocking finding.

| Check | Workflow | Standard | Runs when the PR changes |
| --- | --- | --- | --- |
| `Claude Code Review` | `claude-code-review.yml` | `code-review.md` (+ `AGENTS.md`) | `client/`, `server/`, `services/`, `.github/`, `scripts/`, `.agents/`, `.claude/` |
| `Claude Security Review` | `claude-security-review.yml` | `security-review.md` | `server/src/`, `client/app/api/`, `client/middleware.ts`, `client/next.config.ts`, `.github/`, `scripts/`, `.agents/`, `.claude/` |
| `Codex Review` | `codex-review.yml` | both | anything either Claude review covers |

Draft and fork PRs are skipped (forks get no secrets). The logic lives in `scripts/review-pool.mjs` (tests: `node --test scripts/review-pool.test.mjs`); the Claude run with retry is the local action `.github/actions/claude-review`.

## Claude token pool

| Secret | Owner |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | maintainer |
| `CLAUDE_CODE_OAUTH_TOKEN_ZIYI` | 子毅 |

- Odd PR numbers start code review on the maintainer token and security review on 子毅's; even PRs swap. The Codex stand-in follows code review's order.
- If the first run fails or returns no verdict, the review reruns once with the other token and logs `::warning::… reran with the <name> token`. A blocking verdict is a verdict and never reruns. A warning means the named token needs checking (`claude setup-token` tokens last a year).
- An unset token is skipped with a notice. While `CLAUDE_CODE_OAUTH_TOKEN_ZIYI` is unset, every review runs on the maintainer token.

## Verdict cache (ADR 0006 amendment)

Before calling a model, each review hashes `git diff <base>...<head>` (the PR's own changes against its merge-base), its standard files and the workflow's `PROMPT_VERSION`, and looks up `review-verdict-<code|security|codex>-<sha256>` in the Actions cache. A hit reuses the earlier verdict (`::notice::… reusing its verdict`) and skips the model. Only non-blocking verdicts are saved, so a blocking finding or a failed run is always re-reviewed. When `update-auto-merge-branches.yml` merges `main` into a PR whose own diff is unchanged, all three reviews hit the cache; E2E still reruns.

Bump `PROMPT_VERSION` in a workflow when you change its prompt. Actions caches are scoped per PR (and evicted after 7 days unused), so a verdict is only reused within the same PR.

## Codex Review

Codex signs in with Cyrus's ChatGPT account, following OpenAI's [Maintain Codex account auth in CI/CD](https://developers.openai.com/codex/auth/ci-cd-auth) for ephemeral runners:

1. The `Codex run` job writes `CODEX_AUTH_JSON` to `$CODEX_HOME/auth.json` (dir 700, file 600), masks its tokens, and runs a pinned `@openai/codex` with `codex exec --sandbox read-only` (model `CODEX_MODEL`, reasoning effort high, output schema `{blocking, summary, comment}`).
2. Codex refreshes the tokens itself when they are older than about 8 days. Afterwards the job writes the refreshed file back with `gh secret set CODEX_AUTH_JSON`, authenticated by `CODEX_AUTH_WRITEBACK_TOKEN`.
3. The job is in the `codex-auth` concurrency group, so only one run uses the auth at a time. Codex output is printed only after the refreshed tokens are masked, and a verdict that quotes a token is discarded.
4. The `Codex Review` job posts the findings as one sticky PR comment (`<!-- codex-review -->`) and enforces the verdict.

Fallbacks:

- `CODEX_AUTH_JSON` unset: `::notice::Codex Review is not configured` and the check passes without a stand-in, so the Claude quota is spent only once Codex is onboarded.
- Codex fails, returns no verdict, or its run is displaced from the `codex-auth` queue (GitHub keeps one pending run per group): the Claude pool stands in with the same task and logs `::warning::Claude stood in for Codex`. Repeated stand-ins mean the auth is broken: check the write-back PAT, then reseed.

OpenAI recommends this auth only for trusted private infrastructure. This repo is public, but only same-repo PRs (collaborators with write access) receive the secrets; ADR 0008 accepts that anyone with write access can read them.

## Onboarding a contributor's credential

**子毅 (Claude)**

1. 子毅 runs `claude setup-token` and sends the token to the maintainer over a private channel.
2. The maintainer runs `gh secret set CLAUDE_CODE_OAUTH_TOKEN_ZIYI` and pastes it.

**Cyrus (Codex)**

1. Cyrus sets file storage in `~/.codex/config.toml`: `cli_auth_credentials_store = "file"`, then runs `codex login` (ChatGPT sign-in).
2. He checks it: `jq '{auth_mode, last_refresh, refresh: (.tokens.refresh_token | length > 0)}' ~/.codex/auth.json` must show `"auth_mode": "chatgpt"` and `refresh: true`.
3. With repo write access, he stores it: `gh secret set CODEX_AUTH_JSON -R JasonJTW/megaweave < ~/.codex/auth.json`. After this, CI owns that login: he should not keep using the same `auth.json` locally (the refresh token rotates); run `codex logout && codex login` to get a separate local session.

**Maintainer (write-back PAT)**

1. Create a fine-grained PAT: resource owner `JasonJTW`, only the `megaweave` repository, permission **Secrets: Read and write**, nothing else; one-year expiry.
2. `gh secret set CODEX_AUTH_WRITEBACK_TOKEN` and paste it.
3. After a PR shows a passing `Codex Review` that actually ran Codex (not the "not configured" notice), make it required: add `{ "context": "Codex Review" }` to `required_status_checks` in `scripts/main-ruleset.json`, open a PR, and once merged run `npm run setup:repo`.

**Reseeding** (persistent 401s, revoked token, a failed write-back): repeat Cyrus's steps 1-3.

## Changing a review

- Job names are required checks: renaming one means updating `scripts/main-ruleset.json` and `npm run setup:repo`.
- `CODEX_VERSION` and the pinned action SHAs are updated by hand; pick releases at least 14 days old.
- `claude-code-action` refuses its Claude App token while the running workflow file differs from `main`. A PR that changes a review workflow is therefore reviewed with `GITHUB_TOKEN` (plan step notice `… differs from main`): comments come from `github-actions` and a new summary comment appears per run. That is why the Claude review jobs hold `pull-requests: write`.
