// node --test scripts/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cacheKey,
  codexMode,
  containsSecret,
  isRelevant,
  needsRetry,
  parseVerdict,
  pickTokens,
  secretValues,
} from "./review-pool.mjs";

const both = { maintainer: true, ziyi: true };

describe("pickTokens", () => {
  it("starts odd PRs on the maintainer token and even PRs on ziyi for code review", () => {
    assert.deepEqual(pickTokens(171, "code", both), {
      primary: "maintainer",
      fallback: "ziyi",
      preferred: "maintainer",
    });
    assert.deepEqual(pickTokens(172, "code", both), {
      primary: "ziyi",
      fallback: "maintainer",
      preferred: "ziyi",
    });
  });

  it("gives security review the opposite primary of code review on the same PR", () => {
    for (const pr of [1, 2, 171, 172]) {
      assert.notEqual(pickTokens(pr, "code", both).primary, pickTokens(pr, "security", both).primary);
    }
    assert.equal(pickTokens(171, "security", both).primary, "ziyi");
  });

  it("follows code review's order for the Codex stand-in", () => {
    assert.equal(pickTokens(172, "codex", both).primary, "ziyi");
  });

  it("skips an unset token, so everything runs on the maintainer while ziyi is unset", () => {
    const onlyMaintainer = { maintainer: true, ziyi: false };
    for (const kind of ["code", "security", "codex"]) {
      for (const pr of [171, 172]) {
        const tokens = pickTokens(pr, kind, onlyMaintainer);
        assert.equal(tokens.primary, "maintainer");
        assert.equal(tokens.fallback, "");
      }
    }
    assert.equal(pickTokens(172, "code", onlyMaintainer).preferred, "ziyi");
  });

  it("returns no token when none is set", () => {
    assert.deepEqual(pickTokens(3, "code", {}), { primary: "", fallback: "", preferred: "maintainer" });
  });

  it("rejects a bad PR number or kind", () => {
    assert.throws(() => pickTokens("abc", "code", both));
    assert.throws(() => pickTokens(1, "lint", both));
  });
});

describe("isRelevant", () => {
  it("reviews code in app, infra and script directories", () => {
    assert.equal(isRelevant("code", ["client/app/page.tsx"]), true);
    assert.equal(isRelevant("code", [".github/workflows/ci.yml"]), true);
    assert.equal(isRelevant("code", ["scripts/setup-repo.sh"]), true);
    assert.equal(isRelevant("code", ["docs/development.md", "README.md"]), false);
  });

  it("security-reviews server code, workflows, local actions and scripts only", () => {
    assert.equal(isRelevant("security", ["server/src/api.ts"]), true);
    assert.equal(isRelevant("security", [".github/actions/claude-review/action.yml"]), true);
    assert.equal(isRelevant("security", ["scripts/review-pool.mjs"]), true);
    assert.equal(isRelevant("security", ["client/middleware.ts"]), true);
    assert.equal(isRelevant("security", ["client/components/Button.tsx"]), false);
    assert.equal(isRelevant("security", ["client/middleware.tsx"]), false);
  });

  it("runs Codex when either Claude review would", () => {
    assert.equal(isRelevant("codex", ["client/components/Button.tsx"]), true);
    assert.equal(isRelevant("codex", ["docs/adr/0008.md"]), false);
  });
});

describe("parseVerdict", () => {
  it("accepts a verdict and keeps an optional comment", () => {
    assert.deepEqual(parseVerdict('{"blocking":false,"summary":"ok","extra":1}'), {
      blocking: false,
      summary: "ok",
    });
    assert.deepEqual(parseVerdict('{"blocking":true,"summary":"x","comment":"## c"}'), {
      blocking: true,
      summary: "x",
      comment: "## c",
    });
  });

  it("rejects anything that is not a verdict", () => {
    for (const text of [undefined, "", "  ", "not json", "null", "[]", '{"blocking":"false","summary":"s"}', '{"blocking":false}']) {
      assert.equal(parseVerdict(text), null, String(text));
    }
  });
});

describe("needsRetry", () => {
  const ok = '{"blocking":false,"summary":"ok"}';
  const blocking = '{"blocking":true,"summary":"SQL injection"}';

  it("retries a failed run or a run without a verdict", () => {
    assert.equal(needsRetry({ outcome: "failure", verdict: "", fallback: "ziyi" }), true);
    assert.equal(needsRetry({ outcome: "success", verdict: "", fallback: "ziyi" }), true);
    assert.equal(needsRetry({ outcome: "success", verdict: "{oops", fallback: "maintainer" }), true);
  });

  it("never retries a verdict, blocking or not", () => {
    assert.equal(needsRetry({ outcome: "success", verdict: ok, fallback: "ziyi" }), false);
    assert.equal(needsRetry({ outcome: "success", verdict: blocking, fallback: "ziyi" }), false);
  });

  it("does not retry without a fallback token or after a workflow-validation skip", () => {
    assert.equal(needsRetry({ outcome: "failure", verdict: "", fallback: "" }), false);
    assert.equal(needsRetry({ outcome: "success", verdict: "", skipped: "true", fallback: "ziyi" }), false);
  });
});

describe("cacheKey", () => {
  const base = {
    kind: "code",
    promptVersion: "1",
    standards: [{ path: "docs/agents/code-review.md", content: "# Code review" }],
    diff: "diff --git a/x b/x\n+1\n",
  };

  it("is stable for the same inputs and prefixed by kind", () => {
    assert.equal(cacheKey(base), cacheKey({ ...base }));
    assert.match(cacheKey(base), /^review-verdict-code-[0-9a-f]{64}$/);
    assert.match(cacheKey({ ...base, kind: "codex" }), /^review-verdict-codex-/);
  });

  it("changes when the diff, a standard, the prompt version or the kind changes", () => {
    const key = cacheKey(base);
    assert.notEqual(cacheKey({ ...base, diff: base.diff + "+2\n" }), key);
    assert.notEqual(cacheKey({ ...base, standards: [{ ...base.standards[0], content: "# Code review!" }] }), key);
    assert.notEqual(cacheKey({ ...base, promptVersion: "2" }), key);
    assert.notEqual(cacheKey({ ...base, kind: "security" }).slice(-64), key.slice(-64));
  });

  it("does not let input boundaries shift into each other", () => {
    const a = cacheKey({ ...base, standards: [{ path: "a", content: "bc" }] });
    const b = cacheKey({ ...base, standards: [{ path: "ab", content: "c" }] });
    assert.notEqual(a, b);
  });
});

describe("secret scrubbing", () => {
  const auth = JSON.stringify({
    auth_mode: "chatgpt",
    last_refresh: "2026-11-01T00:00:00Z",
    tokens: { access_token: "eyJ-access-token-value", refresh_token: "rt_refresh-token-value", id_token: "eyJ-id-token-value-x" },
  });

  it("collects the long string values of auth.json", () => {
    const values = secretValues(auth);
    assert.ok(values.includes("rt_refresh-token-value"));
    assert.ok(!values.includes("chatgpt"));
  });

  it("flags output that quotes a token", () => {
    const values = secretValues(auth);
    assert.equal(containsSecret("looks fine", values), false);
    assert.equal(containsSecret("token: rt_refresh-token-value", values), true);
  });
});

describe("codexMode", () => {
  const verdict = '{"blocking":false,"summary":"ok"}';

  it("passes without a model call when irrelevant, cached or not configured", () => {
    assert.equal(codexMode({ relevant: "false", hasAuth: "true" }), "irrelevant");
    assert.equal(codexMode({ relevant: "true", cacheHit: "true", hasAuth: "true" }), "cached");
    assert.equal(codexMode({ relevant: "true", cacheHit: "false", hasAuth: "false" }), "not-configured");
  });

  it("enforces Codex's verdict, and stands in with Claude when there is none", () => {
    assert.equal(codexMode({ relevant: "true", cacheHit: "", hasAuth: "true", codexVerdict: verdict }), "codex");
    assert.equal(codexMode({ relevant: "true", cacheHit: "", hasAuth: "true", codexVerdict: "" }), "stand-in");
  });
});

describe("CLI", () => {
  const run = (command, envVars) => {
    const dir = mkdtempSync(join(tmpdir(), "review-pool-"));
    const output = join(dir, "out");
    writeFileSync(output, "");
    const result = spawnSync(process.execPath, [new URL("./review-pool.mjs", import.meta.url).pathname, command], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, ...envVars },
    });
    const outputs = Object.fromEntries(
      readFileSync(output, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    return { status: result.status, stdout: result.stdout, outputs, dir };
  };

  it("plan keys the PR's own diff, so merging main into the PR keeps the key", () => {
    const repo = mkdtempSync(join(tmpdir(), "review-pool-repo-"));
    const git = (...args) => {
      const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const write = (path, text) => writeFileSync(join(repo, path), text);
    git("init", "-q", "-b", "main");
    spawnSync("mkdir", ["-p", join(repo, "docs/agents"), join(repo, "server")]);
    write("docs/agents/code-review.md", "# Code review\n");
    write("AGENTS.md", "# Agents\n");
    write("server/a.ts", "a\n");
    write("README.md", "r\n");
    git("add", ".");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    git("checkout", "-qb", "pr");
    write("server/a.ts", "a\nb\n");
    git("commit", "-qam", "pr");
    const head1 = git("rev-parse", "HEAD");
    git("checkout", "-q", "main");
    write("README.md", "r2\n");
    git("commit", "-qam", "main moves");
    const main2 = git("rev-parse", "HEAD");
    git("checkout", "-q", "pr");
    git("merge", "-q", "--no-edit", "main");
    const head2 = git("rev-parse", "HEAD");

    const plan = (BASE_SHA, HEAD_SHA, extra = {}) => {
      const output = join(repo, ".out");
      writeFileSync(output, "");
      const r = spawnSync(process.execPath, [new URL("./review-pool.mjs", import.meta.url).pathname, "plan"], {
        cwd: repo,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          GITHUB_OUTPUT: output,
          KIND: "code",
          PR_NUMBER: "171",
          PROMPT_VERSION: "1",
          HAS_MAINTAINER_TOKEN: "true",
          HAS_ZIYI_TOKEN: "false",
          BASE_SHA,
          HEAD_SHA,
          ...extra,
        },
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return Object.fromEntries(
        readFileSync(output, "utf8").split("\n").filter(Boolean).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]),
      );
    };

    const first = plan(base, head1);
    assert.equal(first.relevant, "true");
    assert.equal(first.primary, "maintainer");
    assert.equal(first.fallback, "");
    assert.equal(plan(main2, head2).cache_key, first.cache_key);
    assert.notEqual(plan(base, head1, { PROMPT_VERSION: "2" }).cache_key, first.cache_key);

    const noToken = spawnSync(process.execPath, [new URL("./review-pool.mjs", import.meta.url).pathname, "plan"], {
      cwd: repo,
      encoding: "utf8",
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: join(repo, ".out"), KIND: "code", PR_NUMBER: "1", PROMPT_VERSION: "1", BASE_SHA: base, HEAD_SHA: head1 },
    });
    assert.equal(noToken.status, 1);
    assert.match(noToken.stdout, /::error::No Claude token is set/);
  });

  it("enforce fails on a blocking verdict and marks a passing one cacheable", () => {
    const blocked = run("enforce", { LABEL: "Code review", VERDICT: '{"blocking":true,"summary":"bug"}' });
    assert.equal(blocked.status, 1);
    assert.equal(blocked.outputs.cacheable, "false");
    assert.match(blocked.stdout, /::error::Blocking review findings: bug/);

    const passed = run("enforce", { LABEL: "Code review", VERDICT: '{"blocking":false,"summary":"fine"}' });
    assert.equal(passed.status, 0);
    assert.equal(passed.outputs.cacheable, "true");
    assert.deepEqual(JSON.parse(readFileSync(join(passed.dir, ".review-verdict/verdict.json"), "utf8")), {
      blocking: false,
      summary: "fine",
    });

    const missing = run("enforce", { LABEL: "Code review", VERDICT: "" });
    assert.equal(missing.status, 1);
  });

  it("enforce reuses a cached verdict without a model verdict", () => {
    const hit = run("enforce", { LABEL: "Code review", CACHE_HIT: "true" });
    assert.equal(hit.status, 0);
    assert.equal(hit.outputs.cacheable, "false");
    assert.match(hit.stdout, /::notice::.*reusing its verdict/);
  });

  it("result warns and names the fallback token when it was used", () => {
    const res = run("result", {
      LABEL: "Claude Code Review",
      PRIMARY: "ziyi",
      FALLBACK: "maintainer",
      FALLBACK_RAN: "true",
      FALLBACK_VERDICT: '{"blocking":false,"summary":"ok"}',
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /::warning::.*ziyi Claude token failed.*maintainer token/);
    assert.equal(res.outputs.token, "maintainer");
    assert.deepEqual(JSON.parse(res.outputs.verdict), { blocking: false, summary: "ok" });
  });

  it("result keeps the primary verdict and stays quiet when no fallback ran", () => {
    const res = run("result", {
      LABEL: "Claude Code Review",
      PRIMARY: "maintainer",
      FALLBACK: "",
      FALLBACK_RAN: "",
      PRIMARY_VERDICT: '{"blocking":true,"summary":"x\\ny"}',
    });
    assert.doesNotMatch(res.stdout, /::warning::/);
    assert.equal(res.outputs.token, "maintainer");
    assert.deepEqual(JSON.parse(res.outputs.verdict), { blocking: true, summary: "x\ny" });
  });

  it("scrub drops a Codex verdict that quotes a token from auth.json or its seed", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-pool-scrub-"));
    const authFile = join(dir, "auth.json");
    const verdictFile = join(dir, "verdict.json");
    writeFileSync(authFile, JSON.stringify({ auth_mode: "chatgpt", tokens: { refresh_token: "rt_new-refresh-token-1234" } }));
    const seed = JSON.stringify({ auth_mode: "chatgpt", tokens: { refresh_token: "rt_old-refresh-token-1234" } });

    writeFileSync(verdictFile, '{"blocking":false,"summary":"ok","comment":"No findings."}');
    const clean = run("scrub", { VERDICT_FILE: verdictFile, AUTH_FILE: authFile, SEED_AUTH_JSON: seed });
    assert.deepEqual(JSON.parse(clean.outputs.verdict), { blocking: false, summary: "ok", comment: "No findings." });

    for (const leaked of ["rt_new-refresh-token-1234", "rt_old-refresh-token-1234"]) {
      writeFileSync(verdictFile, JSON.stringify({ blocking: false, summary: "ok", comment: leaked }));
      const dirty = run("scrub", { VERDICT_FILE: verdictFile, AUTH_FILE: authFile, SEED_AUTH_JSON: seed });
      assert.equal(dirty.outputs.verdict, "");
      assert.match(dirty.stdout, /::error::Codex output contains a credential/);
      assert.doesNotMatch(dirty.stdout, /rt_/);
    }

    const none = run("scrub", { VERDICT_FILE: join(dir, "missing.json"), AUTH_FILE: authFile });
    assert.equal(none.outputs.verdict, "");
  });

  it("codex-mode passes with a notice when Codex is not configured and warns on a stand-in", () => {
    const off = run("codex-mode", { RELEVANT: "true", CACHE_HIT: "", HAS_AUTH: "false" });
    assert.equal(off.outputs.mode, "not-configured");
    assert.match(off.stdout, /::notice::Codex Review is not configured/);

    const standIn = run("codex-mode", { RELEVANT: "true", CACHE_HIT: "", HAS_AUTH: "true", CODEX_RESULT: "cancelled" });
    assert.equal(standIn.outputs.mode, "stand-in");
    assert.match(standIn.stdout, /::warning::Claude stood in for Codex: the Codex run ended 'cancelled'/);
  });
});
