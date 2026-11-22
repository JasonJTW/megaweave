#!/usr/bin/env node
// ADR decision check, run by .github/workflows/adr-decisions.yml and locally:
//
//   node scripts/check-adr-decisions.mjs
//
// An ADR's H1 is its decision (docs/adr/, CONTEXT.md). Changing the H1 of an ADR already on
// BASE, or renaming or deleting one, reverses a decision only the maintainer makes, so it needs
// the `adr-approved` label, counted only when a repository admin added it (verifyApproval, the
// same rule as `migration-approved`). Adding an ADR or editing an existing one's body passes
// here; the review (docs/agents/code-review.md) judges whether a body edit changes the decision.
//
// Environment (all optional):
//   BASE_SHA   base commit or ref (default origin/main)
//   HEAD_SHA   branch commit (default HEAD)
//   PR_LABELS  JSON array of label names (default [])
//   GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER
//              verify who added `adr-approved` (required in Actions; a local run trusts PR_LABELS)

import { pathToFileURL } from "node:url";
import { approvalFromGitHub, parseLabels, run } from "./check-db-migrations.mjs";

export const LABEL_ADR_APPROVED = "adr-approved";

const ADR_DIR = "docs/adr/";
const ADR_FILE = /^docs\/adr\/\d{4}-[^/]+\.md$/;
const inActions = process.env.GITHUB_ACTIONS === "true";

/** The first `# ` heading of a Markdown file, trimmed; null when there is none. */
export function adrTitle(markdown) {
  const line = markdown.split("\n").find((l) => /^# \S/.test(l));
  return line ? line.slice(2).trim() : null;
}

/**
 * Lists the decision reversals in `git diff --name-status -M` output for docs/adr/.
 * `titleAt.base(path)` / `titleAt.head(path)` return a file's H1 on each side.
 * Returns [{ file, reason }].
 */
export function findReversals(nameStatus, titleAt) {
  const reversals = [];
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const [status, from, to] = line.split("\t");
    if (!ADR_FILE.test(from)) continue;
    const kind = status[0];
    if (kind === "D") reversals.push({ file: from, reason: "deleted" });
    else if (kind === "R") reversals.push({ file: from, reason: `renamed to ${to} (other files cite ADRs by number and name)` });
    else if (kind === "M") {
      const before = titleAt.base(from);
      const after = titleAt.head(from);
      if (before !== after) reversals.push({ file: from, reason: `decision changed from "${before}" to "${after}"` });
    }
  }
  return reversals;
}

function git(...args) {
  return run("git", args).stdout;
}

async function main() {
  const baseRef = process.env.BASE_SHA || "origin/main";
  const headRef = process.env.HEAD_SHA || "HEAD";
  const labels = parseLabels(process.env.PR_LABELS);
  const mergeBase = git("merge-base", baseRef, headRef).trim();
  const show = (ref) => (path) => adrTitle(git("show", `${ref}:${path}`));
  const reversals = findReversals(git("diff", "--name-status", "-M", mergeBase, headRef, "--", ADR_DIR), {
    base: show(mergeBase),
    head: show(headRef),
  });

  if (reversals.length === 0) {
    console.log("No existing ADR decision changed.");
    return 0;
  }
  const approval = await approvalFromGitHub(labels, LABEL_ADR_APPROVED);
  for (const { file, reason } of reversals) {
    const message = `${file}: ${reason}`;
    if (approval.approved) console.log(`Approved (${LABEL_ADR_APPROVED}): ${message}`);
    else console.log(`${inActions ? "::error::" : "ERROR: "}${message}`);
  }
  if (approval.approved) {
    console.log(`Approval verified: ${approval.reason}`);
    return 0;
  }
  console.log(
    `Changing an accepted ADR's decision is the maintainer's call: stop and ask them (a Decision point, docs/agents/contributing.md). ` +
      `It passes once a repository admin adds the \`${LABEL_ADR_APPROVED}\` label` +
      (labels.includes(LABEL_ADR_APPROVED) ? ` (the label is present but does not count: ${approval.reason}).` : "."),
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`${inActions ? "::error::" : "ERROR: "}${error.message}`);
    process.exitCode = 1;
  }
}
