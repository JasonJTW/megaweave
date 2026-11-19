// node --test scripts/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bodyModels,
  checkAgentPr,
  isAgentBranch,
  parseAllowlist,
  trailerModels,
} from "./check-agent-pr.mjs";

const allowlist = ["claude-opus-5-5", "gpt-6.1-sol"];
const commit = (message, parents = 1, sha = "a".repeat(40)) => ({ sha, message, parents });
const signed = (model) =>
  `fix(weave): fail on zero deductible items\n\nBody text.\n\nModel: ${model}\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
const body = (model) => `Closes #121\n\n## Summary\n\nStuff.\n\nModel: ${model}\n`;

describe("isAgentBranch", () => {
  it("matches agent/ branches only", () => {
    assert.equal(isAgentBranch("agent/cyrus/121-zero-items"), true);
    assert.equal(isAgentBranch("t3/contribute-skill"), false);
    assert.equal(isAgentBranch("feature/agent/x"), false);
    assert.equal(isAgentBranch(undefined), false);
  });
});

describe("parseAllowlist", () => {
  it("reads the committed allowlist", () => {
    const models = parseAllowlist(readFileSync("scripts/agent-models.json", "utf8"));
    assert.ok(models.includes("claude-opus-5-5"));
    assert.ok(models.includes("gpt-6.1-sol"));
  });

  it("rejects a malformed file", () => {
    assert.throws(() => parseAllowlist('{"models": "claude-opus-5-5"}'));
    assert.throws(() => parseAllowlist('{"models": [""]}'));
  });
});

describe("bodyModels", () => {
  it("finds Model lines, tolerating surrounding spaces", () => {
    assert.deepEqual(bodyModels(body("gpt-6.1-sol")), ["gpt-6.1-sol"]);
    assert.deepEqual(bodyModels("  Model:   claude-opus-5-5  \r\nother"), ["claude-opus-5-5"]);
  });

  it("ignores lines that only mention a model", () => {
    assert.deepEqual(bodyModels("The Model: field is below\n**Model:** x"), []);
    assert.deepEqual(bodyModels(null), []);
  });
});

describe("trailerModels", () => {
  it("reads the trailer block only", () => {
    assert.deepEqual(trailerModels(signed("claude-opus-5-5")), ["claude-opus-5-5"]);
    assert.deepEqual(trailerModels("subject\n\nModel: gpt-6.1-sol\n\nCo-Authored-By: x <y@z>"), []);
    assert.deepEqual(trailerModels("Model: gpt-6.1-sol"), []);
  });
});

describe("checkAgentPr", () => {
  it("passes non-agent branches without looking", () => {
    assert.deepEqual(checkAgentPr({ headRef: "t3/x", body: "", commits: [commit("x")], allowlist }), []);
  });

  it("passes a declared, allowed model on body and commits, skipping merge commits", () => {
    const errors = checkAgentPr({
      headRef: "agent/ziyi/121-zero-items",
      body: body("claude-opus-5-5"),
      commits: [commit(signed("claude-opus-5-5")), commit("Merge branch 'main' into agent/ziyi/121", 2)],
      allowlist,
    });
    assert.deepEqual(errors, []);
  });

  it("fails without a Model line, or with two", () => {
    const missing = checkAgentPr({ headRef: "agent/a/1-x", body: "Closes #1", commits: [], allowlist });
    assert.equal(missing.length, 1);
    assert.match(missing[0], /exactly one line/);
    const twice = checkAgentPr({
      headRef: "agent/a/1-x",
      body: `${body("gpt-6.1-sol")}\nModel: claude-opus-5-5`,
      commits: [],
      allowlist,
    });
    assert.match(twice[0], /found 2/);
  });

  it("fails a model outside the allowlist", () => {
    const errors = checkAgentPr({
      headRef: "agent/a/1-x",
      body: body("claude-sonnet-5"),
      commits: [commit(signed("claude-sonnet-5"))],
      allowlist,
    });
    assert.match(errors[0], /not an allowed model/);
  });

  it("fails a commit whose trailer is missing or names another model", () => {
    const errors = checkAgentPr({
      headRef: "agent/a/1-x",
      body: body("gpt-6.1-sol"),
      commits: [
        commit(signed("gpt-6.1-sol"), 1, "1".repeat(40)),
        commit("feat: no trailer", 1, "2".repeat(40)),
        commit(signed("claude-opus-5-5"), 1, "3".repeat(40)),
      ],
      allowlist,
    });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /^Commit 222222222222 \("feat: no trailer"\).*found: none/);
    assert.match(errors[1], /^Commit 333333333333 .*found: claude-opus-5-5/);
  });
});
