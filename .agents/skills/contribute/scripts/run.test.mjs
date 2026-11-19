// node --test .agents/skills/contribute/scripts/*.test.mjs
// Runs run.sh in a throwaway clone with fake `docker`, `claude` and `codex` on PATH.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUN_SH = new URL("./run.sh", import.meta.url).pathname;

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "contribute-run-"));
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
  const origin = join(root, "origin.git");
  const repo = join(root, "repo");
  git(root, "init", "--bare", "-q", "-b", "main", origin);
  git(root, "init", "-q", "-b", "main", repo);
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  const scripts = join(repo, ".agents/skills/contribute/scripts");
  mkdirSync(scripts, { recursive: true });
  copyFileSync(RUN_SH, join(scripts, "run.sh"));
  chmodSync(join(scripts, "run.sh"), 0o755);
  writeFileSync(join(repo, "README.md"), "x\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "origin", "main");

  const bin = join(root, "bin");
  const calls = join(root, "calls.txt");
  mkdirSync(bin);
  const fake = (name, body) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  fake("docker", "exit 0");
  fake("claude", `printf '%s\\n' "claude $*" >> '${calls}'`);
  fake("codex", `printf '%s\\n' "codex $*" >> '${calls}'`);
  const home = join(root, "home");
  mkdirSync(home);

  const run = (harness) =>
    spawnSync(join(scripts, "run.sh"), [harness], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, XDG_STATE_HOME: join(home, "state") },
    });
  const called = () => (existsSync(calls) ? readFileSync(calls, "utf8") : "");
  const log = () => {
    const dir = process.platform === "darwin" ? join(home, "Library/Logs/megaweave-contribute") : join(home, "state/megaweave-contribute");
    return readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  };
  return { repo, git: (...a) => git(repo, ...a), run, called, log };
}

describe("run.sh", () => {
  it("rejects an unknown harness", () => {
    const { run } = sandbox();
    assert.equal(run("gemini").status, 2);
  });

  it("starts Claude Code with the floor model, high effort and auto mode", () => {
    const s = sandbox();
    assert.equal(s.run("claude").status, 0);
    const call = s.called();
    assert.match(call, /^claude -p Scheduled contribute run\. .* Model: claude-opus-5-5 /);
    assert.match(call, /--model claude-opus-5-5 --effort high --permission-mode auto --permission-prompts none/);
  });

  it("starts Codex with the floor model and high reasoning effort", () => {
    const s = sandbox();
    assert.equal(s.run("codex").status, 0);
    assert.match(s.called(), /^codex exec -m gpt-6\.1-sol -c model_reasoning_effort=high --approve-for-me -C /);
  });

  it("skips a run when a human's uncommitted work is on a non-agent branch", () => {
    const s = sandbox();
    writeFileSync(join(s.repo, "README.md"), "manual edit\n");
    assert.equal(s.run("claude").status, 0);
    assert.equal(s.called(), "");
    assert.match(s.log(), /not an agent branch\); skipping/);
  });

  it("stashes an interrupted run's work on its agent branch, then runs", () => {
    const s = sandbox();
    s.git("switch", "-q", "-c", "agent/ziyi/7-x");
    writeFileSync(join(s.repo, "wip.txt"), "half done\n");
    assert.equal(s.run("claude").status, 0);
    assert.match(s.git("stash", "list"), /contribute-wip agent\/ziyi\/7-x/);
    assert.equal(s.git("status", "--porcelain"), "");
    assert.match(s.called(), /^claude -p/);
  });

  it("skips while another run holds the lock", () => {
    const s = sandbox();
    const lock = join(s.repo, ".git/contribute.lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), String(process.pid));
    assert.equal(s.run("claude").status, 0);
    assert.equal(s.called(), "");
    assert.match(s.log(), /another run is in progress/);
  });
});
