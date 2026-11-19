#!/usr/bin/env node
// Review token pool and verdict cache (ADR 0008, ADR 0006 amendment), run by
// .github/workflows/claude-code-review.yml, claude-security-review.yml, codex-review.yml
// and .github/actions/claude-review. Pure logic is exported and covered by
// scripts/review-pool.test.mjs; the CLI reads env and writes $GITHUB_OUTPUT.
//
//   node scripts/review-pool.mjs plan     KIND, PR_NUMBER, BASE_SHA, HEAD_SHA, PROMPT_VERSION,
//                                         HAS_MAINTAINER_TOKEN, HAS_ZIYI_TOKEN, [WORKFLOW_FILE],
//                                         [DIFF_FILE]
//        -> relevant, cache_key, primary, fallback, workflow_changed
//   node scripts/review-pool.mjs retry    OUTCOME, VERDICT, FALLBACK -> retry
//   node scripts/review-pool.mjs result   PRIMARY, FALLBACK, PRIMARY_VERDICT, FALLBACK_VERDICT,
//                                         FALLBACK_RAN, LABEL -> verdict, token
//   node scripts/review-pool.mjs scrub    VERDICT_FILE, AUTH_FILE, [SEED_AUTH_JSON] -> verdict
//   node scripts/review-pool.mjs codex-mode  RELEVANT, CACHE_HIT, HAS_AUTH, CODEX_VERDICT,
//                                         [CODEX_RESULT] -> mode
//   node scripts/review-pool.mjs enforce  LABEL, VERDICT, CACHE_HIT, [VERDICT_DIR] -> cacheable
//
// Tokens are only ever named here ("maintainer", "ziyi"); their values stay in the
// workflow's `with:` inputs.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Bump a workflow's PROMPT_VERSION when its prompt changes, so cached verdicts expire.
const CODE_PATHS = /^(client|server|services|\.github|scripts)\//;
const SECURITY_PATHS =
  /^(server\/src\/|client\/app\/api\/|client\/middleware\.ts$|client\/next\.config\.ts$|\.github\/|scripts\/)/;

// code-review.md applies the AGENTS.md sections by reference, so AGENTS.md is part of its standard.
export const KINDS = {
  code: { standards: ["docs/agents/code-review.md", "AGENTS.md"] },
  security: { standards: ["docs/agents/security-review.md"] },
  codex: {
    standards: ["docs/agents/code-review.md", "docs/agents/security-review.md", "AGENTS.md"],
  },
};

export const TOKENS = ["maintainer", "ziyi"];

function assertKind(kind) {
  if (!Object.hasOwn(KINDS, kind)) throw new Error(`Unknown review kind: ${kind}`);
}

/** Whether a PR touching `files` needs this review. */
export function isRelevant(kind, files) {
  assertKind(kind);
  const code = files.some((f) => CODE_PATHS.test(f));
  const security = files.some((f) => SECURITY_PATHS.test(f));
  if (kind === "code") return code;
  if (kind === "security") return security;
  return code || security;
}

/**
 * Primary and fallback token names. Odd PRs start on the maintainer token for code
 * review, even PRs on ziyi; security review uses the opposite order, so one PR's two
 * reviews draw on both subscriptions. The Codex stand-in follows code review's order.
 * Unset tokens are dropped; '' means none.
 */
export function pickTokens(prNumber, kind, available) {
  assertKind(kind);
  const pr = Number(prNumber);
  if (!Number.isInteger(pr) || pr <= 0) throw new Error(`Invalid PR number: ${prNumber}`);
  let order = pr % 2 === 1 ? ["maintainer", "ziyi"] : ["ziyi", "maintainer"];
  if (kind === "security") order = [...order].reverse();
  const preferred = order[0];
  const usable = order.filter((name) => available[name]);
  return { primary: usable[0] ?? "", fallback: usable[1] ?? "", preferred };
}

/** `{ blocking, summary }` from a review's structured output, or null when it is not a verdict. */
export function parseVerdict(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  if (typeof value.blocking !== "boolean" || typeof value.summary !== "string") return null;
  const verdict = { blocking: value.blocking, summary: value.summary };
  if (typeof value.comment === "string") verdict.comment = value.comment;
  return verdict;
}

/**
 * Retry with the fallback token when the primary run failed or returned no verdict.
 * A blocking verdict is a verdict, so it never retries.
 */
export function needsRetry({ outcome, verdict, fallback }) {
  if (!fallback) return false;
  return outcome !== "success" || parseVerdict(verdict) === null;
}

/**
 * Cache key over what a review's verdict depends on: the PR's own diff against its
 * merge-base, the review standard files and the prompt version. Never the head SHA:
 * merging main into the PR makes a new commit, and the key must survive it (ADR 0006).
 */
export function cacheKey({ kind, promptVersion, standards, diff }) {
  assertKind(kind);
  const hash = createHash("sha256");
  const part = (value) => {
    const buf = Buffer.from(String(value), "utf8");
    hash.update(`${buf.length}:`);
    hash.update(buf);
  };
  part(kind);
  part(promptVersion);
  for (const { path, content } of standards) {
    part(path);
    part(content);
  }
  part(diff);
  return `review-verdict-${kind}-${hash.digest("hex")}`;
}

/** Secret strings from an auth.json (token-like values), for scrubbing model output. */
export function secretValues(authJson) {
  const found = [];
  const walk = (value) => {
    if (typeof value === "string") {
      if (value.length >= 16) found.push(value);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) walk(v);
    }
  };
  walk(JSON.parse(authJson));
  return found;
}

export function containsSecret(text, secrets) {
  return secrets.some((secret) => text.includes(secret));
}

/**
 * What the `Codex Review` check does: 'irrelevant' / 'cached' / 'not-configured' pass
 * without a model call (no stand-in when CODEX_AUTH_JSON is unset, to save the Claude
 * quota until the contributor is onboarded); 'codex' enforces Codex's verdict;
 * 'stand-in' runs the Claude pool because Codex failed or returned no verdict.
 */
export function codexMode({ relevant, cacheHit, hasAuth, codexVerdict }) {
  if (relevant !== "true") return "irrelevant";
  if (cacheHit === "true") return "cached";
  if (hasAuth !== "true") return "not-configured";
  return parseVerdict(codexVerdict) ? "codex" : "stand-in";
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const oneLine = (text) => String(text).replace(/[\r\n]+/g, " ").trim();

function setOutput(name, value) {
  const line = `${name}=${value}\n`;
  if (value.includes("\n")) throw new Error(`Output ${name} must be one line`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
}

function git(...args) {
  const result = spawnSync("git", ["-c", "core.quotepath=off", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function env(name) {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

function plan() {
  const kind = env("KIND");
  const range = `${env("BASE_SHA")}...${env("HEAD_SHA")}`;
  const files = git("diff", "--name-only", range).split("\n").filter(Boolean);
  if (!isRelevant(kind, files)) {
    console.log(`::notice::No changes this ${kind} review covers; skipping review.`);
    setOutput("relevant", "false");
    return 0;
  }
  const diff = git("diff", "--no-color", "--no-ext-diff", range);
  if (process.env.DIFF_FILE) writeFileSync(process.env.DIFF_FILE, diff);
  const standards = KINDS[kind].standards.map((path) => ({
    path,
    content: readFileSync(path, "utf8"),
  }));
  const key = cacheKey({ kind, promptVersion: env("PROMPT_VERSION"), standards, diff });
  const { primary, fallback, preferred } = pickTokens(env("PR_NUMBER"), kind, {
    maintainer: process.env.HAS_MAINTAINER_TOKEN === "true",
    ziyi: process.env.HAS_ZIYI_TOKEN === "true",
  });
  if (!primary && kind !== "codex") {
    console.log(
      "::error::No Claude token is set. Run: claude setup-token, then gh secret set CLAUDE_CODE_OAUTH_TOKEN (see docs/agents/review-workflows.md)",
    );
    return 1;
  }
  if (primary && primary !== preferred) {
    console.log(`::notice::The ${preferred} Claude token is not set; using ${primary} only.`);
  }
  console.log(`Cache key ${key}; Claude tokens: primary=${primary || "none"} fallback=${fallback || "none"}`);
  // claude-code-action's App token is refused while the workflow differs from main
  const workflow = process.env.WORKFLOW_FILE;
  const workflowChanged =
    Boolean(workflow) && spawnSync("git", ["diff", "--quiet", env("BASE_SHA"), "HEAD", "--", workflow]).status !== 0;
  if (workflowChanged) {
    console.log(`::notice::${workflow} differs from main; Claude posts with GITHUB_TOKEN on this PR.`);
  }
  setOutput("relevant", "true");
  setOutput("workflow_changed", String(workflowChanged));
  setOutput("cache_key", key);
  setOutput("primary", primary);
  setOutput("fallback", fallback);
  return 0;
}

function retry() {
  const decision = needsRetry({
    outcome: process.env.OUTCOME,
    verdict: process.env.VERDICT,
    fallback: process.env.FALLBACK,
  });
  setOutput("retry", String(decision));
  return 0;
}

function result() {
  const label = env("LABEL");
  const primary = process.env.PRIMARY;
  const fallback = process.env.FALLBACK;
  if (process.env.FALLBACK_RAN === "true") {
    console.log(
      `::warning::${label}: the ${primary} Claude token failed or returned no verdict; reran with the ${fallback} token. Check the ${primary} token.`,
    );
    const verdict = parseVerdict(process.env.FALLBACK_VERDICT);
    setOutput("verdict", verdict ? JSON.stringify(verdict) : "");
    setOutput("token", fallback);
    return 0;
  }
  const verdict = parseVerdict(process.env.PRIMARY_VERDICT);
  setOutput("verdict", verdict ? JSON.stringify(verdict) : "");
  setOutput("token", primary);
  return 0;
}

function scrub() {
  const text = existsSync(env("VERDICT_FILE")) ? readFileSync(env("VERDICT_FILE"), "utf8") : "";
  const verdict = parseVerdict(text);
  if (!verdict) {
    console.log("::warning::Codex returned no verdict.");
    setOutput("verdict", "");
    return 0;
  }
  const serialized = JSON.stringify(verdict);
  // Check the refreshed auth.json and the seed it replaced
  const secrets = secretValues(readFileSync(env("AUTH_FILE"), "utf8"));
  if (process.env.SEED_AUTH_JSON) secrets.push(...secretValues(process.env.SEED_AUTH_JSON));
  if (containsSecret(serialized, secrets)) {
    console.log("::error::Codex output contains a credential from auth.json; discarding it.");
    setOutput("verdict", "");
    return 0;
  }
  setOutput("verdict", serialized);
  return 0;
}

function mode() {
  const value = codexMode({
    relevant: process.env.RELEVANT,
    cacheHit: process.env.CACHE_HIT,
    hasAuth: process.env.HAS_AUTH,
    codexVerdict: process.env.CODEX_VERDICT,
  });
  if (value === "not-configured") {
    console.log(
      "::notice::Codex Review is not configured (CODEX_AUTH_JSON is unset); passing without a review. See docs/agents/review-workflows.md.",
    );
  } else if (value === "stand-in") {
    const result = oneLine(process.env.CODEX_RESULT || "unknown");
    console.log(
      `::warning::Claude stood in for Codex: the Codex run ended '${result}' without a verdict. Check CODEX_AUTH_JSON and CODEX_AUTH_WRITEBACK_TOKEN.`,
    );
  }
  setOutput("mode", value);
  return 0;
}

function enforce() {
  const label = env("LABEL");
  const dir = process.env.VERDICT_DIR || ".review-verdict";
  const file = join(dir, "verdict.json");
  if (process.env.CACHE_HIT === "true") {
    const cached = existsSync(file) ? parseVerdict(readFileSync(file, "utf8")) : null;
    const summary = cached ? `: ${oneLine(cached.summary)}` : "";
    console.log(`::notice::${label}: diff unchanged since a passing review; reusing its verdict${summary}`);
    setOutput("cacheable", "false");
    return 0;
  }
  const verdict = parseVerdict(process.env.VERDICT);
  setOutput("cacheable", "false");
  if (!verdict) {
    console.log(`::error::${label}: no review verdict returned; see the review step log.`);
    return 1;
  }
  if (verdict.blocking) {
    console.log(`::error::Blocking review findings: ${oneLine(verdict.summary)}`);
    return 1;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ blocking: false, summary: verdict.summary }));
  setOutput("cacheable", "true");
  console.log(`${label} passed: ${oneLine(verdict.summary)}`);
  return 0;
}

const COMMANDS = { plan, retry, result, scrub, "codex-mode": mode, enforce };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const command = COMMANDS[process.argv[2]];
  if (!command) {
    console.error(`Usage: node scripts/review-pool.mjs <${Object.keys(COMMANDS).join("|")}>`);
    process.exitCode = 2;
  } else {
    try {
      process.exitCode = command();
    } catch (error) {
      console.log(`::error::${oneLine(error.message)}`);
      process.exitCode = 1;
    }
  }
}
