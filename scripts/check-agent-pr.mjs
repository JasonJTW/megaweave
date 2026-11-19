#!/usr/bin/env node
// Agent PR model declaration (docs/agents/contributing.md, ADR 0007), run by the
// "Lint, typecheck, test" job in .github/workflows/ci.yml and locally before `gh pr create`:
//
//   PR_BODY="$(cat body.md)" HEAD_REF=agent/<login>/<n>-<slug> node scripts/check-agent-pr.mjs
//
// For a head branch that starts with `agent/`:
//   1. the PR body has exactly one line `Model: <id>`, and <id> is in the allowlist
//      scripts/agent-models.json (read from the base commit in CI, so a PR cannot
//      allow its own model);
//   2. every non-merge commit on the branch carries the trailer `Model: <id>` with the
//      same id.
// Other branches pass.
//
// Environment:
//   HEAD_REF        PR head branch (required; empty passes)
//   PR_BODY         PR body (passed through env, never interpolated into a shell)
//   PR_NUMBER, GITHUB_REPOSITORY, GITHUB_TOKEN, BASE_SHA
//                   in Actions: list the PR's commits and read the allowlist at BASE_SHA
//                   through the API. Without them: commits are `git log BASE..HEAD`
//                   (BASE default origin/main) and the allowlist is the local file.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const AGENT_BRANCH_PREFIX = "agent/";
const MODELS_FILE = "scripts/agent-models.json";
const MODEL_LINE = /^Model:[ \t]*(\S*)[ \t]*$/;

export function isAgentBranch(ref) {
  return typeof ref === "string" && ref.startsWith(AGENT_BRANCH_PREFIX);
}

/** Parses scripts/agent-models.json: `{ "models": ["<id>", ...] }`. */
export function parseAllowlist(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.models) || !parsed.models.every((m) => typeof m === "string" && m)) {
    throw new Error(`${MODELS_FILE} must be {"models": ["<id>", ...]}`);
  }
  return parsed.models;
}

/** The `Model: <id>` lines of a PR body, ids in order (empty id when the line has none). */
export function bodyModels(body) {
  return (body ?? "")
    .split(/\r?\n/)
    .map((line) => MODEL_LINE.exec(line.trim()))
    .filter(Boolean)
    .map((m) => m[1]);
}

/**
 * The `Model` trailer ids of a commit message: lines `Model: <id>` in its last paragraph
 * (the trailer block, as `git interpret-trailers` reads it).
 */
export function trailerModels(message) {
  const paragraphs = (message ?? "").trim().split(/\r?\n\s*\r?\n/);
  if (paragraphs.length < 2) return [];
  return paragraphs
    .at(-1)
    .split(/\r?\n/)
    .map((line) => MODEL_LINE.exec(line.trim()))
    .filter(Boolean)
    .map((m) => m[1]);
}

/**
 * Checks an agent PR. `commits` are `{ sha, message, parents }` (parents = parent count).
 * Returns a list of error strings; empty means pass.
 */
export function checkAgentPr({ headRef, body, commits, allowlist }) {
  if (!isAgentBranch(headRef)) return [];
  const errors = [];
  const declared = bodyModels(body);
  if (declared.length !== 1) {
    errors.push(
      `The PR body needs exactly one line \`Model: <id>\` (found ${declared.length}). Allowed ids: ${allowlist.join(", ")}.`,
    );
    return errors;
  }
  const [model] = declared;
  if (!allowlist.includes(model)) {
    errors.push(
      `\`Model: ${model}\` is not an allowed model. Allowed ids (${MODELS_FILE}): ${allowlist.join(", ")}.`,
    );
  }
  for (const commit of commits) {
    if (commit.parents > 1) continue;
    const trailers = trailerModels(commit.message);
    const subject = (commit.message ?? "").split("\n")[0];
    if (trailers.length !== 1 || trailers[0] !== model) {
      errors.push(
        `Commit ${commit.sha.slice(0, 12)} ("${subject}") needs the trailer \`Model: ${model}\` in its last paragraph (found: ${trailers.join(", ") || "none"}).`,
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function github(path, { raw = false } = {}) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return res;
}

async function apiCommits(repo, pr) {
  const commits = [];
  for (let page = 1; ; page++) {
    const res = await github(`repos/${repo}/pulls/${pr}/commits?per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`Listing PR commits failed: HTTP ${res.status}`);
    const batch = await res.json();
    commits.push(
      ...batch.map((c) => ({ sha: c.sha, message: c.commit.message, parents: c.parents.length })),
    );
    if (batch.length < 100) return commits;
  }
}

async function apiAllowlist(repo, baseSha) {
  const res = await github(`repos/${repo}/contents/${MODELS_FILE}?ref=${encodeURIComponent(baseSha)}`, {
    raw: true,
  });
  // The PR that adds the file has no base copy yet: fall back to the checked-out one.
  if (res.status === 404) return parseAllowlist(readFileSync(MODELS_FILE, "utf8"));
  if (!res.ok) throw new Error(`Reading ${MODELS_FILE} at ${baseSha} failed: HTTP ${res.status}`);
  return parseAllowlist(await res.text());
}

function gitCommits(base) {
  const out = spawnSync("git", ["log", "--format=%H%x00%P%x00%B%x1e", `${base}..HEAD`], {
    encoding: "utf8",
  });
  if (out.status !== 0) throw new Error(`git log ${base}..HEAD failed: ${out.stderr}`);
  return out.stdout
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, ""))
    .filter((rec) => rec.trim())
    .map((rec) => {
      const [sha, parents, message] = rec.split("\x00");
      return { sha, parents: parents.trim().split(/\s+/).filter(Boolean).length, message };
    });
}

async function main() {
  const { HEAD_REF, PR_BODY, PR_NUMBER, GITHUB_REPOSITORY, GITHUB_TOKEN, BASE_SHA } = process.env;
  if (!isAgentBranch(HEAD_REF)) {
    console.log(`Not an agent branch (${HEAD_REF || "none"}): nothing to check.`);
    return;
  }
  const inActions = Boolean(PR_NUMBER && GITHUB_REPOSITORY && GITHUB_TOKEN && BASE_SHA);
  const allowlist = inActions
    ? await apiAllowlist(GITHUB_REPOSITORY, BASE_SHA)
    : parseAllowlist(readFileSync(MODELS_FILE, "utf8"));
  const commits = inActions
    ? await apiCommits(GITHUB_REPOSITORY, PR_NUMBER)
    : gitCommits(BASE_SHA || "origin/main");
  const errors = checkAgentPr({ headRef: HEAD_REF, body: PR_BODY, commits, allowlist });
  if (errors.length) {
    for (const e of errors) console.log(process.env.GITHUB_ACTIONS ? `::error::${e}` : e);
    console.log("See docs/agents/contributing.md (Ship).");
    process.exitCode = 1;
    return;
  }
  console.log(`Agent PR declares an allowed model on the body and on ${commits.length} commit(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
